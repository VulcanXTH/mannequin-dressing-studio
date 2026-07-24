import fs from 'fs'
import path from 'path'
import { powerSaveBlocker } from 'electron'
import { getSettings } from './db'
import * as fal from './falClient'

const RETRY_DELAYS = [5000, 15000]
const PER_KEY_LIMIT = 30

export class QueueManager {
  constructor(db, notify) {
    this.db = db
    this.paused = false
    this.blockerId = null
    this.rr = 0
    this._pending = false
    this.notify = () => {
      if (this._pending) return
      this._pending = true
      setTimeout(() => { this._pending = false; notify() }, 400)
    }
  }

  start() {
    // resume หลังเปิดแอปใหม่: งานที่ค้างระหว่างอัปโหลดกลับเข้าคิว
    // งานที่ running อยู่มี request_id แล้ว — poll ต่อได้เลย ไม่ submit ซ้ำ ไม่เสียเงินซ้ำ
    this.db.prepare(`UPDATE jobs SET status='queued', next_at=0 WHERE status='uploading'`).run()
    // งานที่ crash กลางการเซฟไฟล์ — มี request_id แล้ว กลับไป poll ต่อ
    this.db.prepare(`UPDATE jobs SET status='running' WHERE status='saving'`).run()
    this._timers = [
      setInterval(() => this.tick().catch((e) => console.error('tick', e)), 1500),
      setInterval(() => this.poll().catch((e) => console.error('poll', e)), 2500)
    ]
  }

  // หยุด polling ตอนแอปกำลังปิด (เช่น ตอนอัปเดต) — ให้ main process ออกเร็ว ไม่ค้างให้ตัวติดตั้งต้องวน kill
  stop() {
    this.paused = true
    if (this._timers) this._timers.forEach(clearInterval)
    this._timers = null
  }

  keys(settings) {
    return [settings.apiKey1, settings.apiKey2].filter(Boolean)
  }

  // FAL จำกัด ~30 concurrent ต่อ key — เลือก key ที่งานค้างน้อยสุดและยังไม่เต็ม 30
  pickKeyIdx(settings) {
    const n = this.keys(settings).length
    if (n === 0) return -1
    const perKey = new Array(n).fill(0)
    for (const row of this.db
      .prepare(`SELECT key_idx, COUNT(*) c FROM jobs WHERE status IN ('uploading','running','saving') GROUP BY key_idx`)
      .all()) {
      if (row.key_idx >= 0 && row.key_idx < n) perKey[row.key_idx] = row.c
    }
    let best = -1
    for (let i = 0; i < n; i++) {
      if (perKey[i] >= PER_KEY_LIMIT) continue
      if (best === -1 || perKey[i] < perKey[best]) best = i
    }
    return best
  }

  async tick() {
    if (this.paused) return
    const s = getSettings(this.db)
    if (!s.apiKey1) return
    const cap = Math.min(s.concurrency, PER_KEY_LIMIT * this.keys(s).length)
    const active = this.db.prepare(`SELECT COUNT(*) c FROM jobs WHERE status IN ('uploading','running','saving')`).get().c
    let slots = Math.max(0, cap - active)
    while (slots-- > 0) {
      const job = this.db
        .prepare(`SELECT * FROM jobs WHERE status='queued' AND next_at <= ? ORDER BY id LIMIT 1`)
        .get(Date.now())
      if (!job) break
      const keyIdx = this.pickKeyIdx(s)
      if (keyIdx === -1) break
      this.db.prepare(`UPDATE jobs SET status='uploading', key_idx=? WHERE id=?`).run(keyIdx, job.id)
      this.notify()
      this.runJob({ ...job, key_idx: keyIdx }, s).catch((e) => this.failJob(job.id, e, s))
    }
    this.updateBlocker(s)
  }

  async cachedUpload(key, filePath) {
    const mtime = fs.statSync(filePath).mtimeMs
    const row = this.db.prepare(`SELECT url, mtime FROM uploads WHERE path=?`).get(filePath)
    if (row && row.mtime === mtime) return row.url
    const url = await fal.uploadFile(key, filePath)
    this.db
      .prepare(`INSERT INTO uploads(path,url,mtime) VALUES(?,?,?) ON CONFLICT(path) DO UPDATE SET url=excluded.url, mtime=excluded.mtime`)
      .run(filePath, url, mtime)
    return url
  }

  async runJob(job, s) {
    const key = this.keys(s)[job.key_idx] || s.apiKey1
    const batch = this.db.prepare(`SELECT * FROM batches WHERE id=?`).get(job.batch_id)

    let baseUrl
    if (job.base_image === 'parent_output') {
      const parent = this.db.prepare(`SELECT * FROM jobs WHERE id=?`).get(job.parent_job_id)
      if (!parent || !parent.output_path) throw new Error('parent output missing')
      baseUrl = await this.cachedUpload(key, parent.output_path)
    } else {
      baseUrl = batch.mannequin_url
      if (!baseUrl) {
        baseUrl = await this.cachedUpload(key, batch.mannequin_path)
        this.db.prepare(`UPDATE batches SET mannequin_url=? WHERE id=?`).run(baseUrl, batch.id)
      }
    }
    const garmentUrl = await this.cachedUpload(key, job.garment_path)

    const input = {
      prompt: job.prompt,
      image_urls: [baseUrl, garmentUrl],
      image_size: { width: batch.width, height: batch.height },
      quality: fal.QUALITY_MAP[job.quality] || 'low',
      num_images: 1,
      output_format: 'png'
    }
    const requestId = await fal.submit(key, input)
    this.db.prepare(`UPDATE jobs SET status='running', fal_request_id=? WHERE id=?`).run(requestId, job.id)
    this.notify()
  }

  async poll() {
    const s = getSettings(this.db)
    const running = this.db.prepare(`SELECT * FROM jobs WHERE status='running'`).all()
    await Promise.all(
      running.map(async (job) => {
        const key = this.keys(s)[job.key_idx] || s.apiKey1
        if (!key) return
        try {
          const st = await fal.status(key, job.fal_request_id)
          if (st.status === 'COMPLETED') await this.complete(job, key, s)
        } catch (e) {
          // 4xx จาก status = request ตายแล้ว → นับเป็น fail; network error ชั่วคราว → รอ poll รอบถัดไป
          if (e && e.status && e.status >= 400 && e.status < 500) this.failJob(job.id, e, s)
        }
      })
    )
  }

  async complete(job, key, s) {
    // กันดาวน์โหลดซ้ำ: poll รอบถัดไปมาถึงระหว่างที่รอบนี้ยังเซฟไม่เสร็จ — claim ด้วย atomic update
    const claimed = this.db.prepare(`UPDATE jobs SET status='saving' WHERE id=? AND status='running'`).run(job.id)
    if (claimed.changes === 0) return
    try {
      const res = await fal.result(key, job.fal_request_id)
      const url = res.data.images[0].url
      const outPath = this.outputPath(job)
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
      fs.mkdirSync(path.dirname(outPath), { recursive: true })
      fs.writeFileSync(outPath, buf)
      this.db
        .prepare(`UPDATE jobs SET status='done', output_path=?, done_at=?, error=NULL WHERE id=?`)
        .run(outPath, Date.now(), job.id)
      this.notify()
    } catch (e) {
      this.failJob(job.id, e, s)
    }
  }

  outputPath(job) {
    const batch = this.db.prepare(`SELECT * FROM batches WHERE id=?`).get(job.batch_id)
    const base = path.basename(job.garment_path).replace(/\.[^.]+$/, '')
    const kindTag = { generate: '', regen_high: '', edit_length: '_edit', edit_color: '_edit' }[job.kind] || ''
    let name = `${base}_${job.view}_${job.quality}${kindTag}`
    let p = path.join(batch.output_folder, `${name}.png`)
    let n = 1
    while (fs.existsSync(p)) p = path.join(batch.output_folder, `${name}_v${n++}.png`)
    return p
  }

  failJob(id, err, s) {
    const job = this.db.prepare(`SELECT * FROM jobs WHERE id=?`).get(id)
    if (!job) return
    const attempts = job.attempts + 1
    const maxRetries = s ? s.autoRetry : 2
    const msg = String((err && err.message) || err).slice(0, 500)
    if (attempts <= maxRetries) {
      const delay = RETRY_DELAYS[Math.min(attempts - 1, RETRY_DELAYS.length - 1)]
      this.db
        .prepare(`UPDATE jobs SET status='queued', attempts=?, next_at=?, error=?, fal_request_id=NULL WHERE id=?`)
        .run(attempts, Date.now() + delay, msg, id)
    } else {
      this.db.prepare(`UPDATE jobs SET status='failed', attempts=?, error=? WHERE id=?`).run(attempts, msg, id)
    }
    this.notify()
  }

  retry(jobId) {
    this.db
      .prepare(`UPDATE jobs SET status='queued', attempts=0, next_at=0, error=NULL, fal_request_id=NULL WHERE id=? AND status='failed'`)
      .run(jobId)
    this.notify()
  }

  retryAllFailed(batchId) {
    this.db
      .prepare(`UPDATE jobs SET status='queued', attempts=0, next_at=0, error=NULL, fal_request_id=NULL WHERE batch_id=? AND status='failed'`)
      .run(batchId)
    this.notify()
  }

  setPaused(v) {
    this.paused = v
    this.notify()
  }

  updateBlocker(s) {
    const active = this.db.prepare(`SELECT COUNT(*) c FROM jobs WHERE status IN ('queued','uploading','running','saving')`).get().c
    const want = s.preventSleep && active > 0 && !this.paused
    if (want && this.blockerId === null) this.blockerId = powerSaveBlocker.start('prevent-app-suspension')
    if (!want && this.blockerId !== null) {
      powerSaveBlocker.stop(this.blockerId)
      this.blockerId = null
    }
  }
}

