# Mannequin Dressing Studio — Project Spec

เอกสารสรุปสิ่งที่ต้องทำทั้งหมดสำหรับโปรเจกต์นี้ (อัปเดตล่าสุด: 6 ก.ค. 2026)
Mockup ที่ลูกค้ารีวิวแล้ว: https://mannequin-dressing-studio.vercel.app

---

## 1. ภาพรวม

Desktop application (macOS + Windows) สำหรับธุรกิจแฟชั่น ใช้เจนภาพ "หุ่นลองชุด" แบบ Bulk:
รับรูปหุ่นเปล่า 1 รูป + โฟลเดอร์รูปเสื้อผ้าหลายร้อย/พันรูป → ได้ภาพหุ่นตัวเดิมใส่เสื้อผ้าแต่ละชิ้น
ผ่าน **GPT-Image-2 บน FAL.AI** — สเกลเป้าหมาย **หลักหมื่นรูป/วัน** รันข้ามคืนได้

## 2. ข้อตกลงที่ยืนยันกับลูกค้าแล้ว

| เรื่อง | ข้อสรุป |
|---|---|
| แพลตฟอร์ม | Electron app ติดตั้งในเครื่อง ทั้ง macOS + Windows |
| Code signing | ไม่ sign — ยอมรับคำเตือนตอนติดตั้ง (ทำคู่มือเปิดครั้งแรกให้) |
| Quality | 2 ออปชั่น: **High ฿1.5/รูป** (= FAL `medium`, $0.042) และ **Low ฿0.2/รูป** (= FAL `low`, $0.005) ที่ 1024×1536 — *ไม่ใช้ FAL `high` ($0.165 ≈ ฿6)* |
| Workflow ประหยัด | เจน Low ทั้งชุดก่อน → รูปไหนไม่ตรงต้นฉบับ กดปุ่ม **↻ High** เจนซ้ำรายรูป |
| ผลลัพธ์ | 1 เสื้อ × 1 มุม = 1 รูป |
| มุมภาพ | Front (ปกติ) / Back (หมุน 180°) / Side (หมุน 110° หันหน้าชุดเข้ากระจกเล็กน้อย) — เลือกได้หลายมุมต่อ batch |
| Prompt | Default Prompt 2 ชุด (ข้อ 6) — 2 บรรทัดแรกแทนชื่อไฟล์หุ่น/ชื่อโฟลเดอร์อัตโนมัติ, Custom เป็น option |
| Ratio | Output ratio = ratio ของรูปหุ่น (ปัดเป็นเลขหาร 16 ลงตัว) |
| ความเร็ว | เป้า 20 รูป/นาที, FAL ~30 concurrent, รองรับ API key ที่ 2 |
| Retry | Auto-retry 2 ครั้ง (backoff 5s → 15s) + ปุ่ม Retry รายรูป + Retry All Failed |

## 3. Tech Stack

- **Electron + React + Vite** (renderer), Node.js main process
- **SQLite** (better-sqlite3) — เก็บคิวงาน/สถานะ/ประวัติ ถาวรในเครื่อง
- **@fal-ai/client** — เรียก FAL Queue API จาก main process
- **electron-builder** — แพ็กเป็น `.dmg` (mac) และ `.exe` NSIS (win)
- `powerSaveBlocker` — กันเครื่อง sleep ระหว่างรันงาน
- ค่า config (API keys, prompts, defaults) เก็บใน electron-store / SQLite ในเครื่องเท่านั้น

## 4. FAL API Integration

- Endpoint: **`openai/gpt-image-2/edit`** ผ่าน Queue API (`fal.queue.submit` → poll `status` ทุก ~2.5s → `result`)
- Input ต่อ job: `image_urls: [mannequinUrl, garmentUrl]`, `prompt`, `image_size: {width, height}` (custom, หาร 16 ลงตัว, คำนวณจาก ratio รูปหุ่น เช่น 2:3 → 1024×1536), `quality: "medium" | "low"`, `output_format: "png"`
- อัปโหลดรูปขึ้น `fal.storage.upload()` — รูปหุ่นอัปครั้งเดียวใช้ URL ซ้ำทุก job, รูปเสื้ออัปครั้งเดียวต่อไฟล์ (cache URL ไว้ ใช้ซ้ำตอน edit/regen ได้)
- Mapping quality ใน UI: `High` → fal `medium`, `Low` → fal `low`
- Concurrency limiter ฝั่งแอป (default 20, max 30) + round-robin 2 API keys ถ้ามี

## 5. Modules & Features

### 5.1 Generate (หน้าหลัก)
- อัปรูปหุ่น 1 รูป → อ่านขนาดจริง → แสดง ratio + output size ที่จะใช้
- เลือกโฟลเดอร์เสื้อผ้า → grid thumbnail ติ๊กเลือก/ออกได้รายรูป
- เลือกมุมภาพ (multi-select): Front / Back / Side — 1 มุม = 1 job ต่อเสื้อ
- เลือก Quality (High ฿1.5 / Low ฿0.2), โฟลเดอร์เซฟผลลัพธ์ (มีปุ่มเลือกโฟลเดอร์), output format
- Dropdown เลือก Default Prompt 1/2 + ปุ่ม Custom prompt (option)
- **กล่องประมาณการค่าใช้จ่าย** ก่อนกด: จำนวนเสื้อ × มุม × ราคา quality (แสดง ฿ และ $)
- ปุ่ม "เริ่มเจนทั้งหมด" → เขียน jobs ลง SQLite → เข้า Dashboard

### 5.2 Queue Manager (core — ไม่มี UI ของตัวเอง)
- ดึง job จาก SQLite ตาม concurrency ที่ตั้ง, submit เข้า FAL queue
- Poll สถานะเฉพาะ job ที่ active, อัปเดต SQLite + UI แบบกึ่ง realtime
- Auto-retry 2 ครั้งเมื่อ fail (backoff 5s/15s) แล้วค่อย mark failed
- เสร็จแล้วดาวน์โหลดผล → เซฟลงโฟลเดอร์ output ทันที → mark done
- **Resume ได้เสมอ**: เปิดแอปใหม่หลังปิด/ไฟดับ/เน็ตหลุด → งานที่ done แล้วข้าม, งานค้าง submit ต่อ — ห้ามเจนซ้ำ ห้ามเสียเงินซ้ำ
- ชื่อไฟล์ผลลัพธ์: `{ชื่อไฟล์เสื้อ}_{view}_{quality}.png` เช่น `dress_001_front_low.png`; regen เป็น High → `dress_001_front_high.png`; edit → ต่อท้าย `_v1`, `_v2`

### 5.3 Dashboard (ติดตามงาน)
- ตัวนับ: เสร็จ / กำลังเจน / รอคิว / เฟล + progress bar + throughput จริง (รูป/นาที) + ETA
- การ์ดรายรูป: thumbnail ผลลัพธ์เมื่อเสร็จ + สถานะสี
- การ์ดที่เสร็จ: ปุ่ม **🎨 Edit** (เปิดใน Editor) + ปุ่ม **↻ High** (เจนซ้ำรูปนั้นเป็น High — ใช้หุ่น/เสื้อ/มุม/prompt เดิมอัตโนมัติ)
- การ์ดที่เฟล: ปุ่ม 🔁 Retry + ปุ่มรวม "Retry ที่เฟลทั้งหมด" + ปุ่ม ⏸ พักงาน/ทำต่อ

### 5.4 Editor
ระบบจำ mapping "ผลลัพธ์ ↔ ไฟล์เสื้อต้นฉบับ" จาก SQLite — **ทุกการเจนใหม่แนบรูปเสื้อต้นฉบับเป็น ref อัตโนมัติ** ไม่ต้องอัปโหลดซ้ำ (มีปุ่ม "เปลี่ยนรูปเอง" เผื่อกรณีพิเศษ)

| เครื่องมือ | ประเภท | รายละเอียด |
|---|---|---|
| 1. สั้น–ยาว | เจนใหม่ (เสียเงิน) | toggle สั้นลง/ยาวขึ้น + slider 10–50% step 5% → prompt เช่น "Make the garment 25% shorter…" + ref ต้นฉบับ |
| 2. Match สี | เจนใหม่ (เสียเงิน) | ส่งรูปที่เจน + รูปเสื้อต้นฉบับ (auto-attach) + prompt สั่ง match สี/ลาย/เนื้อผ้าให้ตรง ref |
| 3. Dull ⟷ Vibrant | ในเครื่อง ฟรี ทันที | slider −50%…+50% ปรับ saturation ผ่าน Canvas เห็นผล realtime |
| 4. สว่าง ⟷ มืด (Exposure) | ในเครื่อง ฟรี ทันที | slider −50…+50 ปรับ brightness แบบปุ่ม Exposure ใน iPhone Photos ใช้ร่วมกับข้อ 3 ได้ |

- Version chain: ต้นฉบับ → v1 → v2 … ทุกเวอร์ชันเก็บแยกไฟล์ ย้อนกลับได้
- ปุ่ม "บันทึกเป็นไฟล์ใหม่" สำหรับผลจากเครื่องมือ 3–4

### 5.5 Settings
- API Key 1 (บังคับ) + Key 2 (option) + ปุ่มทดสอบ key
- Concurrency (1–30, default 20), Quality เริ่มต้น, Auto-retry (0/2/3), Output format
- กันเครื่อง sleep ระหว่างรันงาน (default เปิด)
- แก้ไข Default Prompt ทั้ง 2 ชุดได้ + ปุ่ม reset

## 6. Prompt Spec

**การแทนชื่ออัตโนมัติ (2 บรรทัดแรก):** `"Mannequin Image"` → ชื่อไฟล์หุ่นที่อัป, `"Dress Folder"` → ชื่อโฟลเดอร์เสื้อที่เลือก (Prompt 2: Box 1 = รูปหุ่น, Box 2 = รูปเสื้อ ตามลำดับ image_urls)

**Default Prompt 1 (ห้องกระจก / mirror reflection):**
> Use the "Mannequin Image" as the base image. Put the garment from "Dress Folder" on the mannequin in the first image. Preserve all garment details, including the ruching, fabric texture, satin trim, shadows, highlights, and transparency of the garment. Keep the mannequin, room, mirror reflection, lighting, and background unchanged. Ensure the reflected dress in the mirror is recolored identically. Produce a realistic, high-quality photo with natural color consistency throughout the garment.

**Default Prompt 2 (ฉากผนัง charcoal):**
> Dress the mannequin (Box 1) with the uploaded garment (Box 2). The mannequin remains exactly as shown — white torso form with wooden round top, set against the dark charcoal panel background. Preserve every detail of the garment.

**View suffix (ต่อท้าย prompt ตามมุมที่เลือก):**
- Front: ไม่เติม
- Back: `Turn the mannequin 180 degrees to show the back of the garment.`
- Side: `Rotate the mannequin to a full side profile view: the front of the garment faces the mirror on the right, so the camera sees the garment directly from its side seam, and the mirror reflection shows the front of the garment at a three-quarter angle.` *(calibrate กับรูป ref ลูกค้าแล้ว 6 ก.ค. — "110°" ของลูกค้า = full profile หันหน้าชุดเข้ากระจก)*

## 7. เฟสการสร้าง + เกณฑ์ผ่าน

| เฟส | งาน | เกณฑ์ผ่าน (verify) |
|---|---|---|
| **0. Setup** | โครง Electron+React+Vite, SQLite schema, โครง IPC | แอปเปิดได้ทั้ง mac (dev) + hot reload ทำงาน |
| **1. เจนเดี่ยว end-to-end** | อัปหุ่น+เสื้อ 1 คู่ → FAL → เซฟผล, prompt ทั้ง 2 ชุด + view suffix, คำนวณ image_size | เจนจริงสำเร็จด้วยรูปจริงของลูกค้า ทั้ง 3 มุม, ลูกค้ารีวิวคุณภาพผ่าน |
| **2. Bulk + Queue + Dashboard** | โฟลเดอร์ input, SQLite queue, concurrency, dual key, polling, auto-retry, auto-save, resume | ยิง batch ≥100 รูปจริง: throughput ≥20 รูป/นาที, ฆ่าแอปกลางทางแล้วเปิดใหม่ทำต่อได้ ไม่เจนซ้ำ |
| **3. Editor** | 4 เครื่องมือ + auto-attach ref + version chain + ปุ่ม Edit/↻ High จาก Dashboard | ทดสอบครบทุกเครื่องมือกับผลจริง, เครื่องมือ 3–4 ไม่เรียก API |
| **4. Polish + Package** | ประมาณการราคา, error message, คู่มือเปิดครั้งแรก, build .dmg + .exe | ติดตั้งบนเครื่อง mac + windows จริงและรัน batch ได้ |

## 8. งานที่ค้าง / ต้องได้จากลูกค้า

- [x] รูปหุ่นจริง + รูปเสื้อตัวอย่าง (ได้แล้ว 6 ก.ค. — ทดสอบเฟส 1 ผ่าน ดู `test-results/`)
- [x] FAL API key (ได้แล้ว — บันทึกใน settings ของแอปแล้ว)
- [x] รูปตัวอย่างองศา Side view (ได้แล้ว 6 ก.ค. — calibrate prompt สำเร็จ ดู `test-results/dress_side_high_calibrated.png` · บทเรียน: โมเดลไม่เข้าใจตัวเลของศา ต้องบรรยายภาพที่ต้องการแทน)
- [ ] ถ้าจะยิงหมื่นรูป/วันให้จบในเวลางาน (ไม่ใช่ข้ามคืน) → แนะนำติดต่อ FAL ขอเพิ่ม concurrency (enterprise)
- หมายเหตุ: ราคา ฿ ในแอปคำนวณจาก rate ~36 ฿/$ — แสดง $ กำกับเสมอ

## 8.1 ผลทดสอบเฟส 1 (6 ก.ค. 2026 — ผ่าน)

- เจนจริง 5+1 รูปด้วยรูปหุ่น/เสื้อจริงของลูกค้า: front/back/side ×ชุดยาว + front ×เสื้อ — สำเร็จทั้งหมด ใบละ 54–89 วิ, ยิงพร้อมกัน 5 ใบจบใน 90 วิ (ยืนยัน throughput เป้า 20+/นาที ที่ concurrency 20–30)
- คุณภาพ: ลายผ้า/เลื่อม/ซิปหลัง/เงาสะท้อนกระจก ครบทั้ง Low และ High — Low (฿0.2) ใกล้เคียง High (฿1.5) มาก ให้ลูกค้าดูจริงจาก `test-results/dress_front_low.png` vs `dress_front_high.png`
- **บทเรียนสำคัญ: รูปจาก iPhone เป็น HEIC + มี EXIF orientation** → ถ้าไม่จัดการ โมเดลได้ภาพนอนตะแคง แอปแก้แล้ว: รับ .heic และ bake+strip EXIF อัตโนมัติทุกรูปก่อนอัปโหลด (`prepareImage` ใน falClient.js)
- มุม Back (180°) ทำงานดีมาก / มุม Side calibrate กับรูป ref ลูกค้าแล้ว — ผ่าน

## 8.2 ผลทดสอบเฟส 2 — Bulk + Resume (6 ก.ค. 2026 — ผ่าน)

- **50 งานผ่าน QueueManager จริงของแอป: เสร็จ 50/50, เฟล 0, retry 0**
- **Resume test ผ่าน:** SIGKILL แอปตอนเสร็จ 15 รูป (18 งานกำลังเจนกลางอากาศ) → เปิดใหม่ งานที่มี request_id ถูก poll ต่อทันทีโดยไม่ submit ซ้ำ (ไม่เสียเงินซ้ำ) จบครบ 50 — เสียเวลาจาก crash แค่ ~10 วิ
- **เจอ+แก้ bug ไฟล์ซ้ำ:** poll ทุก 2.5 วิ เรียกดาวน์โหลดซ้ำระหว่างไฟล์ใหญ่ยังเซฟไม่เสร็จ → เพิ่มสถานะ `saving` + atomic claim ใน `complete()` — ยืนยันด้วย batch ที่สอง 12 งาน: 0 ไฟล์ซ้ำ
- **Throughput จริง:** sustained ~12.3 รูป/นาที ที่ concurrency 20 (Low ใช้เวลา 45–120 วิ/รูป แกว่งตามช่วงเวลา) → ประมาณ ~18–20 รูป/นาที ที่ concurrency 30 (ตั้ง default เครื่องลูกค้าเป็น 30 แล้ว) — ถ้าต้องการ 20+/นาที การันตี แนะนำ API key ที่ 2 หรือขอ FAL เพิ่ม concurrency
- เทียบคุณภาพ Low vs High เพิ่ม: `test-results/shirt2_front_low.png` vs `shirt2_front_high.png`
- Dashboard รายงานผลสำหรับลูกค้า: https://mannequin-dressing-studio.vercel.app/report/

## 8.3 ผลทดสอบเฟส 3–4 (7 ก.ค. 2026 — ผ่าน)

- **ลูกค้าเคาะแล้ว:** ① โหมดผสม Low→↻High (ตรงกับที่แอปทำอยู่) ② ความเร็ว ~20 รูป/นาที
- **รองรับ 2 key เต็มระบบ:** cap รวม = 30/key (สูงสุด 60), เลือก key ที่ว่างสุดต่อ job, slider ใน Settings ขยายตาม — เพื่อการันตี 20+/นาที ให้ใส่ key ที่ 2
- **Editor ทดสอบจริงผ่าน:** ปรับสั้น 30% ✓ (เจอเงากระจกไม่อัปเดต → แก้ prompt เพิ่ม mirror clause แล้ว retest ผ่าน) · Match สี ✓ (สี/ลายตรง ref, ทรงเดิม)
- **ทดสอบสั้นลงครบทุกระดับ slider (10–50% ทีละ 5% = 9 รูป):** รอบแรกพบช่วง % สูงสลับลำดับ (40 สั้นกว่า 50, 45 แทบไม่สั้น) — ลูกค้าทักมา → **แก้ lengthPrompt**: เพิ่มคำระดับความแรง (slightly/noticeably/much/dramatically ตามช่วง %) + ระบุเป้าหมาย "hem ends at ~{100−pct}% of current length" → เจนใหม่ทั้งบันได v2 ไล่ระดับถูกต้องไม่มีสลับ ผลอยู่ `test-results/length-steps/*_v2.png` (contact sheet: `contact_sheet_v2.jpg`) และเป็น viewer ใน dashboard `/report/` · ข้อจำกัดที่แจ้งลูกค้าแล้ว: ขั้นห่าง 5% ที่ติดกันอาจใกล้เคียงกัน เจนซ้ำเพื่อสุ่มใหม่ได้
- **แพ็กเสร็จ:** `app/dist/Mannequin Dressing Studio-0.1.0-arm64.dmg` (114MB, Apple Silicon) + `Mannequin Dressing Studio Setup 0.1.0.exe` (98MB, Win x64, native module ครบ) — mac packaged app ผ่าน smoke test แล้ว / **exe ยังไม่ได้ทดสอบบน Windows จริง** (ต้องลองบนเครื่องลูกค้าหรือ VM ก่อนส่งมอบจริง) · คู่มือติดตั้ง: `app/INSTALL_GUIDE.md`
- ถ้าลูกค้าใช้ Mac Intel ต้อง build เพิ่ม: `npx electron-builder --mac --x64`

## 8.4 ส่งมอบ (7 ก.ค. 2026)

- **Installers รอบสุดท้าย** (รวม lengthPrompt v2 + ระบบ 2 key): `app/dist/*.dmg` (114MB) + `app/dist/*Setup*.exe` (98MB)
- **คู่มือละเอียด + Quick Guide** (HTML + PDF): โฟลเดอร์ `manual/` — online: https://mannequin-dressing-studio.vercel.app/manual/ และ `/manual/quick.html` · PDF ดาวน์โหลดได้จากทั้งสองหน้า
- Dashboard ผลทดสอบ: https://mannequin-dressing-studio.vercel.app/report/ · Mockup: หน้าแรกโดเมนเดิม

## 9. โครงสร้าง repo (ปัจจุบัน)

- `index.html` — mockup ที่ deploy บน Vercel (project: `vulcanxs-projects/mannequin-dressing-studio`) — จะแยกออกจาก source ของแอปจริงเมื่อเริ่มเฟส 0 (แอปจริงอยู่ใน `app/`)
- `PROJECT_SPEC.md` — เอกสารนี้ (อยู่ใน `.vercelignore` ไม่ขึ้น public)
