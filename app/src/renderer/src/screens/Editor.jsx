import React, { useEffect, useState, useCallback } from 'react'

const media = (p) => 'media://' + encodeURI(p.replace(/\\/g, '/'))

export default function Editor({ jobId, setJobId, showToast }) {
  const [job, setJob] = useState(null)
  const [versions, setVersions] = useState([])
  const [direction, setDirection] = useState('shorter')
  const [percent, setPercent] = useState(30)
  const [sat, setSat] = useState(0)
  const [exp, setExp] = useState(0)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!jobId) return
    setJob(await window.api.invoke('job:get', { jobId }))
    setVersions(await window.api.invoke('job:versions', { jobId }))
  }, [jobId])

  useEffect(() => {
    load()
    const off = window.api.onJobsChanged(load)
    return off
  }, [load])

  if (!jobId || !job)
    return (
      <section className="screen">
        <h2 className="sc">แก้ไขภาพที่เจนแล้ว</h2>
        <div className="panel empty">
          ยังไม่ได้เลือกรูป — ไปที่หน้า “ติดตามงาน” แล้วกดปุ่ม 🎨 Edit บนรูปที่เจนเสร็จ
        </div>
      </section>
    )

  const garmentName = job.garment_path.split(/[\\/]/).pop()
  const adjusted = sat !== 0 || exp !== 0
  const filter = `saturate(${1 + sat / 100}) brightness(${1 + exp / 100})`

  const saveAdjusted = async () => {
    const img = new Image()
    img.src = media(job.output_path)
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d')
    ctx.filter = filter
    ctx.drawImage(img, 0, 0)
    const r = await window.api.invoke('editor:saveAdjusted', { jobId: job.id, dataUrl: c.toDataURL('image/png') })
    if (r.path) showToast('บันทึกแล้ว: ' + r.path.split(/[\\/]/).pop())
    else showToast('บันทึกไม่สำเร็จ: ' + r.error)
  }

  const submitEdit = async (channel, args) => {
    setBusy(true)
    const r = await window.api.invoke(channel, { jobId: job.id, ...args })
    setBusy(false)
    if (r && r.error) showToast('ส่งงานไม่สำเร็จ: ' + r.error)
    else showToast('ส่งงานแก้ไขเข้าคิวแล้ว — ดูสถานะที่หน้า ติดตามงาน')
  }

  return (
    <section className="screen">
      <h2 className="sc">
        แก้ไขภาพที่เจนแล้ว
        <small>
          กำลังแก้: {job.output_path ? job.output_path.split(/[\\/]/).pop() : '(ยังเจนไม่เสร็จ)'} — เจนจากเสื้อ {garmentName} · ทุกเวอร์ชันเก็บแยกไฟล์ ไม่ทับของเดิม
        </small>
      </h2>
      <div className="ed">
        <div className="canvas">
          {job.output_path ? (
            <img src={media(job.output_path)} alt="result" style={{ filter }} />
          ) : (
            <div className="empty">งานนี้ยังเจนไม่เสร็จ</div>
          )}
          {versions.length > 1 && (
            <div className="versions">
              {versions.map((v, i) => (
                <button key={v.id} className={'v' + (v.id === jobId ? ' on' : '')} onClick={() => setJobId(v.id)}>
                  {i === 0 ? 'ต้นฉบับ' : `v${i} · ${v.kind.replace('edit_', '').replace('regen_high', '↻High')} ${v.status !== 'done' ? '⏳' : ''}`}
                </button>
              ))}
            </div>
          )}
          {adjusted && (
            <button className="btn rose" style={{ padding: '9px 18px', fontSize: '.84rem' }} onClick={saveAdjusted}>
              💾 บันทึกเป็นไฟล์ใหม่
            </button>
          )}
        </div>

        <div className="tools">
          <div className="tool">
            <div className="tool-head">
              <h3>1 · ความสั้น–ยาวของชุด</h3>
              <span className="badge regen">เจนใหม่ · High ฿1.5</span>
            </div>
            <div className="seg">
              <button className={direction === 'shorter' ? 'on' : ''} onClick={() => setDirection('shorter')}>✂️ สั้นลง</button>
              <button className={direction === 'longer' ? 'on' : ''} onClick={() => setDirection('longer')}>📏 ยาวขึ้น</button>
            </div>
            <div className="slider-row">
              <input type="range" min="10" max="50" step="5" value={percent} onChange={(e) => setPercent(Number(e.target.value))} aria-label="เปอร์เซ็นต์ความสั้นยาว" />
              <span className="val">{percent}%</span>
            </div>
            <div className="ticks"><span>10%</span><span>20%</span><span>30%</span><span>40%</span><span>50%</span></div>
            <p className="desc" style={{ margin: '10px 0 0', color: 'var(--ok)' }}>✓ แนบรูปเสื้อต้นฉบับเป็น ref อัตโนมัติ — กันสี/ลายเพี้ยนตอนเจนใหม่</p>
            <div className="tool-foot">
              <button className="btn rose" style={{ padding: '8px 16px', fontSize: '.82rem' }} disabled={busy || !job.output_path} onClick={() => submitEdit('editor:length', { direction, percent })}>
                Generate
              </button>
            </div>
          </div>

          <div className="tool">
            <div className="tool-head">
              <h3>2 · Match สีให้ตรงต้นฉบับ</h3>
              <span className="badge regen">เจนใหม่ · High ฿1.5</span>
            </div>
            <p className="desc">ระบบจำได้ว่าภาพนี้เจนจากเสื้อตัวไหน — แนบรูปต้นฉบับให้เองอัตโนมัติ กดปุ่มเดียวจบ</p>
            <div className="ref-chip">
              <img src={media(job.garment_path)} alt="" />
              <span>Ref: {garmentName}</span>
              <span className="auto">✓ แนบอัตโนมัติ</span>
            </div>
            <div className="tool-foot">
              <button className="btn rose" style={{ padding: '8px 16px', fontSize: '.82rem' }} disabled={busy || !job.output_path} onClick={() => submitEdit('editor:color', {})}>
                Match Color
              </button>
            </div>
          </div>

          <div className="tool">
            <div className="tool-head">
              <h3>3 · Dull ⟷ Vibrant</h3>
              <span className="badge free">ทันที · ฟรี ไม่ต้องเจน</span>
            </div>
            <div className="slider-row">
              <input type="range" min="-50" max="50" step="10" value={sat} onChange={(e) => setSat(Number(e.target.value))} aria-label="ปรับ Dull-Vibrant" />
              <span className="val">{sat > 0 ? '+' : ''}{sat}%</span>
            </div>
            <div className="ticks"><span>Dull −50%</span><span>0</span><span>Vibrant +50%</span></div>
          </div>

          <div className="tool">
            <div className="tool-head">
              <h3>4 · สว่าง ⟷ มืด (Exposure)</h3>
              <span className="badge free">ทันที · ฟรี ไม่ต้องเจน</span>
            </div>
            <div className="slider-row">
              <input type="range" min="-50" max="50" step="5" value={exp} onChange={(e) => setExp(Number(e.target.value))} aria-label="ปรับความสว่าง Exposure" />
              <span className="val">{exp > 0 ? '+' : ''}{exp}</span>
            </div>
            <div className="ticks"><span>มืด −50</span><span>0</span><span>สว่าง +50</span></div>
          </div>
        </div>
      </div>
    </section>
  )
}
