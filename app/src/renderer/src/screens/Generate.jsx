import React, { useState } from 'react'
import { media } from '../media'

const VIEWS = [
  ['front', 'Front — ด้านหน้า', 'ตามปกติ'],
  ['back', 'Back — ด้านหลัง', 'หมุนหุ่น 180° (ถ้ามีรูป _back จะใช้เป็น ref เอง)'],
  ['side', 'Side — ด้านข้าง', 'หมุนหุ่น 110° หันหน้าชุดเข้ากระจกเล็กน้อย']
]

// จับคู่รูปหน้า/หลังของชุดเดียวกันจากชื่อไฟล์: ลงท้าย _front / _back (หรือ -front / -back)
// เช่น dress01_front.jpg + dress01_back.jpg → 1 ชุด · ไฟล์ที่ไม่เข้าคู่ = ชุดเดี่ยวตามเดิม
function groupGarments(files) {
  const paired = new Map()
  const singles = []
  for (const f of files) {
    const base = f.name.replace(/\.[^.]+$/, '')
    const m = base.match(/^(.+?)[ _-](front|back)$/i)
    if (m) {
      const key = m[1].toLowerCase()
      const g = paired.get(key) || { key: m[1], front: null, back: null }
      g[m[2].toLowerCase()] = f
      paired.set(key, g)
    } else {
      singles.push({ key: base, front: f, back: null })
    }
  }
  const groups = []
  for (const g of paired.values()) {
    if (g.front) groups.push(g)
    else groups.push({ key: g.key, front: g.back, back: null }) // มีแต่ _back → ใช้เป็นชุดเดี่ยว
  }
  return [...groups, ...singles].sort((a, b) => a.key.localeCompare(b.key))
}

export default function Generate({ config, onStarted, showToast }) {
  const { settings, prices, pricesThb } = config
  const [mannequin, setMannequin] = useState(null)
  const [folder, setFolder] = useState(null)
  const [excluded, setExcluded] = useState(new Set())
  const [views, setViews] = useState(new Set(['front']))
  const [quality, setQuality] = useState(settings.defaultQuality || 'low')
  const [promptId, setPromptId] = useState(1)
  const [useCustom, setUseCustom] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [outputFolder, setOutputFolder] = useState(settings.lastOutputFolder || '')
  const [starting, setStarting] = useState(false)

  const pickMannequin = async () => {
    const m = await window.api.invoke('pick:image')
    if (m) setMannequin(m)
  }
  const pickFolder = async () => {
    const f = await window.api.invoke('pick:folder')
    if (f) {
      setFolder(f)
      setExcluded(new Set())
    }
  }
  const pickOutput = async () => {
    const p = await window.api.invoke('pick:outputFolder')
    if (p) {
      setOutputFolder(p)
      window.api.invoke('settings:set', { lastOutputFolder: p }) // จำไว้ให้รอบหน้า
    }
  }
  const toggleView = (v) =>
    setViews((prev) => {
      const next = new Set(prev)
      next.has(v) ? next.delete(v) : next.add(v)
      return next
    })
  const toggleGarment = (key) =>
    setExcluded((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const groups = folder ? groupGarments(folder.files) : []
  const selected = groups.filter((g) => !excluded.has(g.key))
  const jobCount = selected.length * views.size
  const usd = jobCount * (prices[quality] || 0)
  // ฿ คิดจากเรตที่สื่อสารกับลูกค้า (฿0.2/฿1.5) ให้ตรงกับคู่มือ — ไม่ปัดเศษทิ้งใน batch เล็ก
  const thb = jobCount * (pricesThb[quality] || 0)
  const thbText = thb % 1 ? thb.toFixed(2).replace(/0$/, '') : String(thb)

  const canStart = mannequin && selected.length > 0 && views.size > 0 && outputFolder && settings.apiKey1 && !starting

  const start = async () => {
    setStarting(true)
    try {
      const { batchId } = await window.api.invoke('batch:create', {
        mannequinPath: mannequin.path,
        garments: selected.map((g) => ({ path: g.front.path, backPath: g.back ? g.back.path : null })),
        views: [...views],
        quality,
        promptId,
        customPrompt: useCustom ? customPrompt : '',
        outputFolder
      })
      onStarted(batchId)
    } catch (e) {
      showToast('เริ่มงานไม่สำเร็จ: ' + e.message)
    } finally {
      setStarting(false)
    }
  }

  return (
    <section className="screen">
      <h2 className="sc">
        สร้างภาพแบบ Bulk
        <small>หุ่น 1 รูป × เสื้อผ้าทั้งโฟลเดอร์ → ได้ภาพหุ่นใส่ชุด ratio เท่ารูปหุ่น</small>
      </h2>

      <div className="gen-top">
        <div className="panel">
          <p className="lbl">1 · รูปหุ่น (1 รูป)</p>
          <div className="drop" onClick={pickMannequin} role="button" tabIndex={0}>
            {mannequin ? (
              <>
                <img src={media(mannequin.path)} alt="mannequin" />
                <div className="hint">{mannequin.name}</div>
                <span className="ratio-tag">
                  {mannequin.width}×{mannequin.height} → output {mannequin.target.width}×{mannequin.target.height}
                </span>
              </>
            ) : (
              <div className="hint">คลิกเพื่อเลือกรูปหุ่น</div>
            )}
          </div>
        </div>
        <div className="panel">
          <p className="lbl">2 · โฟลเดอร์เสื้อผ้า</p>
          <div className="folder-row">
            <div className="folder-path">📁 {folder ? folder.dir : 'ยังไม่ได้เลือก'}</div>
            <button className="btn ghost" onClick={pickFolder}>เลือกโฟลเดอร์…</button>
          </div>
          {folder && (
            <>
              <div className="thumbs">
                {groups.map((g) => (
                  <div
                    key={g.key}
                    className={'th' + (excluded.has(g.key) ? ' off' : '')}
                    onClick={() => toggleGarment(g.key)}
                    title={g.key + (g.back ? ' (มีรูปหน้า+หลัง)' : '')}
                  >
                    <img src={media(g.front.path)} alt={g.key} loading="lazy" />
                    {!excluded.has(g.key) && <span className="ck">✓</span>}
                    {g.back && <span className="pair-badge">หน้า+หลัง</span>}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '.76rem', color: 'var(--tx2)', margin: '10px 0 0' }}>
                เลือกแล้ว <b style={{ color: 'var(--tx)' }}>{selected.length} / {groups.length} ชุด</b> · คลิกรูปเพื่อติ๊กออก/เข้า
              </p>
              <p style={{ fontSize: '.72rem', color: 'var(--tx3)', margin: '6px 0 0', lineHeight: 1.6 }}>
                💡 ชุดเดียวมีรูปหน้า+หลัง: ตั้งชื่อไฟล์ลงท้าย <b style={{ color: 'var(--tx2)' }}>_front</b> และ <b style={{ color: 'var(--tx2)' }}>_back</b> (เช่น dress01_front.jpg + dress01_back.jpg) ระบบจับคู่ให้เอง — ตอนเจนมุม Back จะใช้รูปด้านหลังเป็น ref อัตโนมัติ
              </p>
            </>
          )}
        </div>
      </div>

      <div className="panel">
        <p className="lbl">3 · มุมภาพต่อเสื้อ 1 ตัว (เลือกได้หลายมุม · 1 มุม = 1 รูป)</p>
        <div className="views">
          {VIEWS.map(([id, title, desc]) => (
            <button key={id} className={'vw' + (views.has(id) ? ' on' : '')} onClick={() => toggleView(id)}>
              <b>{title}</b>
              <span>{desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <p className="lbl">4 · ตั้งค่าการเจน</p>
        <div className="opt-row">
          <div className="field">
            <label>Quality</label>
            <select value={quality} onChange={(e) => setQuality(e.target.value)}>
              <option value="high">High — ฿1.5/รูป (~$0.042)</option>
              <option value="low">Low — ฿0.2/รูป (~$0.005)</option>
            </select>
          </div>
          <div className="field">
            <label>โฟลเดอร์เซฟผลลัพธ์</label>
            <div className="key-row">
              <input type="text" value={outputFolder} readOnly placeholder="ยังไม่ได้เลือก" />
              <button className="btn ghost" style={{ whiteSpace: 'nowrap' }} onClick={pickOutput}>📁 เลือก…</button>
            </div>
          </div>
          <div className="field">
            <label>💬 Default Prompt</label>
            <div className="key-row">
              <select value={promptId} onChange={(e) => setPromptId(Number(e.target.value))} disabled={useCustom}>
                <option value={1}>Prompt 1 — ห้องกระจก (mirror)</option>
                <option value={2}>Prompt 2 — ฉากผนัง charcoal</option>
              </select>
              <button className="btn ghost" style={{ whiteSpace: 'nowrap' }} onClick={() => setUseCustom(!useCustom)}>
                {useCustom ? 'ใช้ Default' : 'Custom'}
              </button>
            </div>
          </div>
        </div>
        {useCustom ? (
          <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} placeholder="พิมพ์ custom prompt สำหรับ batch นี้…" />
        ) : (
          <p style={{ fontSize: '.74rem', color: 'var(--tx3)', margin: '4px 2px 0', lineHeight: 1.6 }}>
            2 บรรทัดแรกปรับตามชื่อ source อัตโนมัติ — “Use{' '}
            <b style={{ color: 'var(--tx2)' }}>{mannequin ? mannequin.name : 'Mannequin Image'}</b> as the base image. Put the garment from{' '}
            <b style={{ color: 'var(--tx2)' }}>{folder ? folder.name : 'Dress Folder'}</b> on the mannequin…”
          </p>
        )}
      </div>

      <div className="go-bar">
        <div className="cost">
          ประมาณการ:{' '}
          <b>
            {selected.length} เสื้อ × {views.size} มุม × {quality === 'high' ? 'High' : 'Low'} = {jobCount} รูป ≈ ฿{thbText}
          </b>{' '}
          (${usd.toFixed(2)})
          <br />
          <span style={{ fontSize: '.76rem', color: 'var(--tx3)' }}>
            {!settings.apiKey1 && '⚠ ยังไม่ได้ใส่ API Key — ไปที่หน้า ตั้งค่า ก่อน'}
          </span>
        </div>
        <button className="btn rose" disabled={!canStart} onClick={start}>
          ▶ เริ่มเจนทั้งหมด
        </button>
      </div>
    </section>
  )
}
