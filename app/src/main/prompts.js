export const DEFAULT_PROMPT_1 = `Use the "Mannequin Image" as the base image. Put the garment from "Dress Folder" on the mannequin in the first image. Preserve all garment details, including the ruching, fabric texture, satin trim, shadows, highlights, and transparency of the garment. Keep the mannequin, room, mirror reflection, lighting, and background unchanged. Ensure the reflected dress in the mirror is recolored identically. Produce a realistic, high-quality photo with natural color consistency throughout the garment.`

export const DEFAULT_PROMPT_2 = `Dress the mannequin (Box 1) with the uploaded garment (Box 2). The mannequin remains exactly as shown — white torso form with wooden round top, set against the dark charcoal panel background. Preserve every detail of the garment.`

export const VIEW_SUFFIX = {
  front: '',
  back: 'Turn the mannequin 180 degrees to show the back of the garment.',
  // ลูกค้าเรียก "110°" — โมเดลไม่เข้าใจองศา ต้องบรรยายภาพแทน (calibrate กับรูป ref ลูกค้า 6 ก.ค. 2026)
  side: 'Rotate the mannequin to a full side profile view: the front of the garment faces the mirror on the right, so the camera sees the garment directly from its side seam, and the mirror reflection shows the front of the garment at a three-quarter angle.'
}

// 2 บรรทัดแรกของ default prompt อ้างชื่อ source — แทนด้วยชื่อไฟล์/โฟลเดอร์จริงที่ผู้ใช้เลือก
export function buildPrompt({ template, mannequinName, folderName, view }) {
  let p = template
    .split('"Mannequin Image"').join(`"${mannequinName}"`)
    .split('"Dress Folder"').join(`"${folderName}"`)
  const suffix = VIEW_SUFFIX[view] || ''
  if (suffix) p += ' ' + suffix
  return p
}

export function lengthPrompt(direction, percent) {
  // ตัวเลข % เพียวๆ โมเดลแยกช่วงสูงไม่ออก (40 เคยออกมาสั้นกว่า 50) — ต้องมีคำบรรยายระดับ + เป้าหมายความยาวกำกับ
  const level = percent <= 15 ? 'slightly' : percent <= 30 ? 'noticeably' : percent <= 45 ? 'much' : 'dramatically'
  const target =
    direction === 'longer'
      ? `extend the garment so its total length becomes about ${100 + percent} percent of the current length`
      : `shorten the garment so its hem ends at about ${100 - percent} percent of the current length`
  return `Make the garment on the mannequin ${level} ${direction === 'longer' ? 'longer' : 'shorter'}: ${target} (a ${percent} percent change). Keep the mannequin, pose, camera angle, lighting, background, and every other detail of the garment exactly the same. If a mirror reflection is visible, update the reflected garment to match the new length identically. Use the second image as the exact reference for the garment's color, pattern, and fabric texture.`
}

export function colorMatchPrompt() {
  return `Adjust the garment on the mannequin so its color, pattern, and fabric texture match the garment in the second reference image exactly. Do not change the garment's shape, length, or fit. Keep the mannequin, pose, camera angle, lighting, and background completely unchanged.`
}

