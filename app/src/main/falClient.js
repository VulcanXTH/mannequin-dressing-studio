import fs from 'fs'
import path from 'path'
import { createFalClient } from '@fal-ai/client'
import Jimp from 'jimp'
import heicConvert from 'heic-convert'

export const MODEL = 'openai/gpt-image-2/edit'
// UI ใช้ชื่อ High/Low ตามภาษาลูกค้า — แมปเป็นระดับจริงของ FAL
export const QUALITY_MAP = { high: 'medium', low: 'low' }
export const PRICE_USD = { high: 0.042, low: 0.005 }

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

const clients = new Map()
function clientFor(key) {
  if (!clients.has(key)) clients.set(key, createFalClient({ credentials: key }))
  return clients.get(key)
}

// อ่านค่า EXIF orientation (tag 274) จาก JPEG โดยตรง — คืน 1 ถ้าไม่มี
function jpegOrientation(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return 1
  let i = 2
  while (i + 4 < buf.length) {
    if (buf[i] !== 0xff) break
    const marker = buf[i + 1]
    const len = buf.readUInt16BE(i + 2)
    if (marker === 0xe1 && buf.toString('ascii', i + 4, i + 8) === 'Exif') {
      const tiff = i + 10
      const le = buf.toString('ascii', tiff, tiff + 2) === 'II'
      const rd16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o))
      const rd32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o))
      const ifd = tiff + rd32(tiff + 4)
      const count = rd16(ifd)
      for (let n = 0; n < count; n++) {
        const e = ifd + 2 + n * 12
        if (rd16(e) === 274) return rd16(e + 8) || 1
      }
      return 1
    }
    i += 2 + len
  }
  return 1
}

// รูปจาก iPhone: แปลง HEIC → JPEG และ bake EXIF orientation ลง pixel จริง (ไม่งั้นโมเดลเห็นภาพนอนตะแคง)
export async function prepareImage(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  let buf = fs.readFileSync(filePath)
  let mime = MIME[ext] || 'image/png'
  let changed = false
  if (ext === '.heic' || ext === '.heif') {
    buf = Buffer.from(await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.92 }))
    mime = 'image/jpeg'
    changed = true
  }
  if (mime === 'image/jpeg' && jpegOrientation(buf) !== 1) {
    const img = await Jimp.read(buf) // Jimp auto-rotate ตาม EXIF ตอนอ่าน แล้วเขียนใหม่แบบไม่มี tag
    buf = await img.quality(95).getBufferAsync(Jimp.MIME_JPEG)
    changed = true
  }
  return { buffer: buf, mime, changed }
}

export async function uploadFile(key, filePath) {
  const { buffer, mime } = await prepareImage(filePath)
  const name = path.basename(filePath).replace(/\.(heic|heif)$/i, '.jpg')
  const file = new File([buffer], name, { type: mime })
  return clientFor(key).storage.upload(file)
}

export async function submit(key, input) {
  const { request_id } = await clientFor(key).queue.submit(MODEL, { input })
  return request_id
}

export async function status(key, requestId) {
  return clientFor(key).queue.status(MODEL, { requestId, logs: false })
}

export async function result(key, requestId) {
  return clientFor(key).queue.result(MODEL, { requestId })
}

export async function testKey(key) {
  const file = new File([Buffer.from('ok')], 'ping.txt', { type: 'text/plain' })
  await clientFor(key).storage.upload(file)
}

// ratio ตามรูปหุ่น ปัดเป็นเลขหาร 16 ลงตัว สเกลให้อยู่โซน ~1024–1536px (โซนราคา ฿1.5/฿0.2)
export function computeSize(w, h) {
  const ratio = w / h
  const clamped = Math.max(1 / 3, Math.min(3, ratio))
  let outW, outH
  if (clamped >= 1) {
    outW = 1536
    outH = Math.round(outW / clamped / 16) * 16
  } else {
    outH = 1536
    outW = Math.round(outH * clamped / 16) * 16
  }
  // API ต้องการพิกเซลรวมขั้นต่ำ 655,360
  while (outW * outH < 655360) { outW += 16; outH = Math.round(outW / clamped / 16) * 16 }
  return { width: outW, height: outH }
}

