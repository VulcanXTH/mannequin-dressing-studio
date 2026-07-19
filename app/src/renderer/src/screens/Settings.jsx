import React, { useState } from 'react'

export default function Settings({ config, onSaved, showToast }) {
  const [s, setS] = useState(config.settings)
  const [test1, setTest1] = useState(null)
  const [test2, setTest2] = useState(null)

  const save = async (patch) => {
    const next = { ...s, ...patch }
    setS(next)
    await window.api.invoke('settings:set', patch)
    onSaved()
  }

  const testKey = async (key, setResult) => {
    if (!key) return setResult({ ok: false, error: 'ยังไม่ได้ใส่ key' })
    setResult({ testing: true })
    setResult(await window.api.invoke('key:test', { key }))
  }

  return (
    <section className="screen">
      <h2 className="sc">
        ตั้งค่า<small>ค่าทั้งหมดจำไว้ในเครื่อง ไม่ต้องกรอกใหม่</small>
      </h2>
      <div className="set-grid">
        <div className="panel">
          <p className="lbl">FAL.AI API Keys</p>
          <div className="field">
            <label>API Key 1 (หลัก)</label>
            <div className="key-row">
              <input type="password" value={s.apiKey1} onChange={(e) => save({ apiKey1: e.target.value })} placeholder="xxxxxxxx:xxxxxxxx (มี : คั่นกลาง)" />
              <button className="btn ghost" onClick={() => testKey(s.apiKey1, setTest1)}>ทดสอบ</button>
              {test1 && (test1.testing ? <span className="okmark">…</span> : test1.ok ? <span className="okmark">✓ ใช้ได้</span> : <span className="badmark" title={test1.error}>✗ ใช้ไม่ได้</span>)}
            </div>
          </div>
          <div className="field">
            <label>API Key 2 (สำรอง — เพิ่มความเร็ว, ไม่บังคับ)</label>
            <div className="key-row">
              <input type="password" value={s.apiKey2} onChange={(e) => save({ apiKey2: e.target.value })} placeholder="ยังไม่ได้ใส่" />
              <button className="btn ghost" onClick={() => testKey(s.apiKey2, setTest2)}>ทดสอบ</button>
              {test2 && (test2.testing ? <span className="okmark">…</span> : test2.ok ? <span className="okmark">✓ ใช้ได้</span> : <span className="badmark" title={test2.error}>✗ ใช้ไม่ได้</span>)}
            </div>
          </div>
        </div>

        <div className="panel">
          <p className="lbl">การเจน</p>
          <div className="field">
            <label>
              จำนวนงานพร้อมกัน (concurrency) — {s.concurrency}
              {!s.apiKey2 && s.concurrency >= 30 && ' · เพิ่ม API Key 2 เพื่อไปได้ถึง 60'}
            </label>
            <input type="range" min="1" max={s.apiKey2 ? 60 : 30} value={s.concurrency} onChange={(e) => save({ concurrency: Number(e.target.value) })} aria-label="concurrency" />
          </div>
          <div className="field">
            <label>Quality เริ่มต้น</label>
            <select value={s.defaultQuality} onChange={(e) => save({ defaultQuality: e.target.value })}>
              <option value="high">High — ฿1.5/รูป</option>
              <option value="low">Low — ฿0.2/รูป</option>
            </select>
          </div>
          <div className="field">
            <label>Auto-retry เมื่อเฟล</label>
            <select value={s.autoRetry} onChange={(e) => save({ autoRetry: Number(e.target.value) })}>
              <option value={2}>2 ครั้ง (แนะนำ)</option>
              <option value={3}>3 ครั้ง</option>
              <option value={0}>ปิด — กดเองอย่างเดียว</option>
            </select>
          </div>
          <div className="field">
            <label>ระหว่างรันงาน</label>
            <select value={s.preventSleep ? '1' : '0'} onChange={(e) => save({ preventSleep: e.target.value === '1' })}>
              <option value="1">กันเครื่อง sleep อัตโนมัติ (แนะนำสำหรับรันข้ามคืน)</option>
              <option value="0">ปกติ</option>
            </select>
          </div>
        </div>

        <div className="panel" style={{ gridColumn: '1 / -1' }}>
          <p className="lbl">Default Prompts (แก้ได้ · “Mannequin Image” และ “Dress Folder” จะถูกแทนด้วยชื่อจริงอัตโนมัติ)</p>
          <div className="field">
            <label>Prompt 1 — ห้องกระจก (mirror reflection)</label>
            <textarea value={s.prompt1} onChange={(e) => save({ prompt1: e.target.value })} />
          </div>
          <div className="field">
            <label>Prompt 2 — ฉากผนัง charcoal</label>
            <textarea value={s.prompt2} onChange={(e) => save({ prompt2: e.target.value })} />
          </div>
          <button
            className="btn ghost"
            onClick={async () => {
              const d = config.promptDefaults
              setS((prev) => ({ ...prev, prompt1: d.prompt1, prompt2: d.prompt2 }))
              await window.api.invoke('settings:set', { prompt1: d.prompt1, prompt2: d.prompt2 })
              onSaved()
              showToast('รีเซ็ต prompt กลับเป็นค่าตั้งต้นจากโรงงานแล้ว')
            }}
          >
            Reset prompts เป็นค่าตั้งต้น
          </button>
        </div>
      </div>
    </section>
  )
}
