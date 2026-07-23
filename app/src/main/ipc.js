import { ipcMain, dialog, app } from 'electron'
import fs from 'fs'
import path from 'path'
import sizeOf from 'image-size'
import { getSettings, setSettings } from './db'
import * as fal from './falClient'
import { buildPrompt, lengthPrompt, colorMatchPrompt, DEFAULT_PROMPT_1, DEFAULT_PROMPT_2 } from './prompts'

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'])

// รูปหุ่นต้อง normalize ก่อนใช้ (HEIC จาก iPhone + EXIF orientation) — เก็บ copy ที่สะอาดไว้ใน cache
async function normalizeToCache(p) {
  const { buffer, changed } = await fal.prepareImage(p)
  if (!changed) return p
  const dir = path.join(app.getPath('userData'), 'normalized')
  fs.mkdirSync(dir, { recursive: true })
  const out = path.join(dir, path.basename(p).replace(/\.[^.]+$/, '') + '_normalized.jpg')
  fs.writeFileSync(out, buffer)
  return out
}

export function registerIpc(db, qm, getWin) {
  const h = (ch, fn) => ipcMain.handle(ch, (_e, args) => fn(args))

  h('settings:get', () => ({
    settings: getSettings(db),
    prices: fal.PRICE_USD,
    pricesThb: fal.PRICE_THB,
    promptDefaults: { prompt1: DEFAULT_PROMPT_1, prompt2: DEFAULT_PROMPT_2 }
  }))
  h('settings:set', (patch) => setSettings(db, patch))

  h('pick:image', async () => {
    const r = await dialog.showOpenDialog(getWin(), {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] }]
    })
    if (r.canceled || !r.filePaths[0]) return null
    const p = await normalizeToCache(r.filePaths[0])
    const dim = sizeOf(p)
    return { path: p, name: path.basename(r.filePaths[0]), ...dim, target: fal.computeSize(dim.width, dim.height) }
  })

  h('pick:folder', async () => {
    const r = await dialog.showOpenDialog(getWin(), { properties: ['openDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    const dir = r.filePaths[0]
    const files = fs
      .readdirSync(dir)
      .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
      .sort()
      .map((f) => ({ path: path.join(dir, f), name: f }))
    return { dir, name: path.basename(dir), files }
  })

  h('pick:outputFolder', async () => {
    const r = await dialog.showOpenDialog(getWin(), { properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })

  h('image:dataUrl', ({ filePath }) => {
    const ext = path.extname(filePath).toLowerCase().replace('.', '') || 'png'
    const mime = ext === 'jpg' ? 'jpeg' : ext
    return `data:image/${mime};base64,${fs.readFileSync(filePath).toString('base64')}`
  })

  h('key:test', async ({ key }) => {
    try {
      await fal.testKey(key)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e.message || e).slice(0, 200) }
    }
  })

  h('batch:create', ({ mannequinPath, garments, views, quality, promptId, customPrompt, outputFolder }) => {
    const s = getSettings(db)
    const dim = sizeOf(mannequinPath)
    const { width, height } = fal.computeSize(dim.width, dim.height)
    const template = customPrompt || (promptId === 2 ? s.prompt2 : s.prompt1)
    const folderName = path.basename(path.dirname(garments[0].path))
    const now = Date.now()

    const info = db
      .prepare(`INSERT INTO batches(created_at,mannequin_path,garment_folder,output_folder,quality,views,width,height,prompt_id,prompt_text)
                VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run(now, mannequinPath, folderName, outputFolder, quality, JSON.stringify(views), width, height, promptId, template)
    const batchId = info.lastInsertRowid

    const ins = db.prepare(`INSERT INTO jobs(batch_id,kind,garment_path,view,quality,prompt,base_image,created_at)
                            VALUES(?,?,?,?,?,?,?,?)`)
    const tx = db.transaction(() => {
      for (const g of garments)
        for (const view of views) {
          // ชุดที่มีรูปหลังแยก (_back): มุม Back ใช้รูปหลังเป็น ref แทน
          const useBackRef = view === 'back' && g.backPath
          const gp = useBackRef ? g.backPath : g.path
          let prompt = buildPrompt({ template, mannequinName: path.basename(mannequinPath), folderName, view })
          if (useBackRef) prompt += ' The reference image shows the back side of the garment.'
          ins.run(batchId, 'generate', gp, view, quality, prompt, 'mannequin', now)
        }
    })
    tx()
    return { batchId, jobCount: garments.length * views.length }
  })

  h('batches:list', () =>
    db.prepare(`SELECT b.*, (SELECT COUNT(*) FROM jobs j WHERE j.batch_id=b.id) job_count FROM batches b ORDER BY id DESC LIMIT 30`).all()
  )

  h('jobs:list', ({ batchId }) => ({
    jobs: db.prepare(`SELECT * FROM jobs WHERE batch_id=? ORDER BY id`).all(batchId),
    paused: qm.paused
  }))

  h('job:get', ({ jobId }) => db.prepare(`SELECT * FROM jobs WHERE id=?`).get(jobId))

  h('job:retry', ({ jobId }) => qm.retry(jobId))
  h('batch:retryFailed', ({ batchId }) => qm.retryAllFailed(batchId))

  // ลบ batch ออกจากรายการ — งานค้างถูกยกเลิก แต่ไฟล์ผลลัพธ์บนดิสก์ไม่ถูกแตะ
  h('batch:delete', ({ batchId }) => {
    db.prepare('DELETE FROM jobs WHERE batch_id=?').run(batchId)
    db.prepare('DELETE FROM batches WHERE id=?').run(batchId)
    qm.notify()
    return { ok: true }
  })
  h('queue:pause', () => qm.setPaused(true))
  h('queue:resume', () => qm.setPaused(false))

  // เจนซ้ำรูปเดิมเป็น High — ใช้หุ่น/เสื้อ/มุม/prompt เดิมทั้งหมด
  h('job:regenHigh', ({ jobId }) => {
    const j = db.prepare(`SELECT * FROM jobs WHERE id=?`).get(jobId)
    if (!j) return null
    db.prepare(`INSERT INTO jobs(batch_id,kind,garment_path,view,quality,prompt,base_image,parent_job_id,created_at)
                VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(j.batch_id, 'regen_high', j.garment_path, j.view, 'high', j.prompt, 'mannequin', j.id, Date.now())
    qm.notify()
    return { ok: true }
  })

  // Editor: ปรับสั้น-ยาว / match สี — แนบรูปเสื้อต้นฉบับเป็น ref อัตโนมัติ (image_urls[1])
  const createEdit = (jobId, kind, prompt) => {
    const j = db.prepare(`SELECT * FROM jobs WHERE id=?`).get(jobId)
    if (!j || !j.output_path) return { error: 'job has no output yet' }
    db.prepare(`INSERT INTO jobs(batch_id,kind,garment_path,view,quality,prompt,base_image,parent_job_id,created_at)
                VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(j.batch_id, kind, j.garment_path, j.view, 'high', prompt, 'parent_output', j.id, Date.now())
    qm.notify()
    return { ok: true }
  }
  h('editor:length', ({ jobId, direction, percent }) => createEdit(jobId, 'edit_length', lengthPrompt(direction, percent)))
  h('editor:color', ({ jobId }) => createEdit(jobId, 'edit_color', colorMatchPrompt()))

  h('job:versions', ({ jobId }) =>
    db.prepare(`SELECT * FROM jobs WHERE id=? OR parent_job_id=? ORDER BY id`).all(jobId, jobId)
  )

  // เซฟผลจากเครื่องมือ Dull/Vibrant + Exposure (ปรับในเครื่อง)
  h('editor:saveAdjusted', ({ jobId, dataUrl }) => {
    const j = db.prepare(`SELECT * FROM jobs WHERE id=?`).get(jobId)
    if (!j || !j.output_path) return { error: 'no output' }
    const base = j.output_path.replace(/\.png$/i, '')
    let n = 1
    let p = `${base}_adj${n}.png`
    while (fs.existsSync(p)) p = `${base}_adj${++n}.png`
    fs.writeFileSync(p, Buffer.from(dataUrl.split(',')[1], 'base64'))
    return { path: p }
  })
}

