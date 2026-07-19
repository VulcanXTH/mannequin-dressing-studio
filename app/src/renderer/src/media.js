// helper เดียวใช้ทุกหน้าจอ — ต้องเป็น media:/// (3 slash):
// บน Windows path ขึ้นต้นด้วย drive (D:/...) ถ้าใช้ 2 slash URL parser จะกิน "D:" เป็น hostname
// ทำให้ drive หายและเปิดไฟล์ไม่เจอ (BUG-1 จาก QA Windows 16 ก.ค. 2026)
export const media = (p) => 'media:///' + encodeURI(p.replace(/\\/g, '/').replace(/^\/+/, ''))
