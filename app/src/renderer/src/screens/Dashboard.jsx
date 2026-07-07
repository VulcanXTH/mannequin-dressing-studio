import React, { useEffect, useState, useCallback } from 'react'

const media = (p) => 'media://' + encodeURI(p.replace(/\\/g, '/'))
const ST_LABEL = { queued: 'รอคิว', uploading: 'อัปโหลด…', running: 'กำลังเจน', saving: 'เซฟไฟล์…', done: '✓ เสร็จ', failed: '✗ เฟล' }

export default function Dashboard({ config, batchId, setBatchId, openEditor, showToast }) {
  const [batches, setBatches] = useState([])
  const [jobs, setJobs] = useState([])
  const [paused, setPaused] = useState(false)

  const load = useCallback(async () => {
    const bs = await window.api.invoke('batches:list')
    setBatches(bs)
    const id = batchId || (bs[0] && bs[0].id)
    if (!id) return
    const r = await window.api.invoke('jobs:list', { batchId: id })
    setJobs(r.jobs)
    setPaused(r.paused)
  }, [batchId])

  useEffect(() => {
    load()
    const off = window.api.onJobsChanged(load)
    const iv = setInterval(load, 4000)
    return () => {
      off()
      clearInterval(iv)
    }
  }, [load])

  const batch = batches.find((b) => b.id === batchId) || batches[0]
  const count = (st) => jobs.filter((j) => j.status === st).length
  const done = count('done')
  const active = count('running') + count('uploading') + count('saving')
  const queued = count('queued')
  const failed = count('failed')
  const total = jobs.length
  const pct = total ? Math.round((done / total) * 100) : 0

  // throughput จากงานที่เสร็จใน 2 นาทีล่าสุด
  const now = Date.now()
  const recent = jobs.filter((j) => j.done_at && now - j.done_at < 120000).length
  const rate = recent / 2
  const etaMin = rate > 0 ? Math.ceil((queued + active) / rate) : null

  if (!batch)
    return (
      <section className="screen">
        <h2 className="sc">ติดตามงานแบบ Realtime</h2>
        <div className="panel empty">ยังไม่มีงาน — ไปที่หน้า “สร้างภาพ” เพื่อเริ่ม batch แรก</div>
      </section>
    )

  return (
    <section className="screen">
      <div className="dash-head">
        <h2 className="sc">
          ติดตามงานแบบ Realtime
          <small>
            Batch #{batch.id} · {batch.garment_folder} · Quality {batch.quality === 'high' ? 'High ฿1.5' : 'Low ฿0.2'} — รูปไหนไม่ตรงค่อยกด ↻ High รายรูป
          </small>
        </h2>
        {batches.length > 1 && (
          <select style={{ width: 'auto' }} value={batch.id} onChange={(e) => setBatchId(Number(e.target.value))}>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                #{b.id} · {b.garment_folder} ({b.job_count})
              </option>
            ))}
          </select>
        )}
        <button
          className="btn ghost"
          onClick={async () => {
            await window.api.invoke(paused ? 'queue:resume' : 'queue:pause')
            load()
          }}
        >
          {paused ? '▶ ทำต่อ' : '⏸ พักงาน'}
        </button>
        {failed > 0 && (
          <button
            className="btn ghost"
            style={{ color: 'var(--bad)', borderColor: 'rgba(224,122,122,.4)' }}
            onClick={() => window.api.invoke('batch:retryFailed', { batchId: batch.id })}
          >
            🔁 Retry ที่เฟลทั้งหมด ({failed})
          </button>
        )}
      </div>

      <div className="stats">
        <div className="stat ok"><div className="n">{done}</div><div className="t">✓ เสร็จแล้ว (เซฟลงเครื่องแล้ว)</div></div>
        <div className="stat busy"><div className="n">{active}</div><div className="t">กำลังเจน</div></div>
        <div className="stat q"><div className="n">{queued}</div><div className="t">รอคิว{paused ? ' (พักอยู่)' : ''}</div></div>
        <div className="stat bad"><div className="n">{failed}</div><div className="t">เฟล (auto-retry ครบแล้ว)</div></div>
      </div>

      <div className="panel">
        <div className="prog-wrap">
          <div className="prog"><i style={{ width: pct + '%' }} /></div>
          <span className="meta">{done}/{total} · {pct}%</span>
          <span className="meta" style={{ color: 'var(--rose)' }}>⚡ {rate.toFixed(1)} รูป/นาที</span>
          <span className="meta">{etaMin !== null ? `เหลือ ~${etaMin} นาที` : '—'}</span>
        </div>
      </div>

      <div className="jobs">
        {jobs.map((j) => (
          <div className="job" key={j.id}>
            <div className="pic">
              {j.status === 'done' && j.output_path ? (
                <img src={media(j.output_path)} alt="" loading="lazy" />
              ) : j.status === 'running' || j.status === 'uploading' ? (
                '…'
              ) : j.status === 'failed' ? (
                '—'
              ) : (
                'รอ'
              )}
            </div>
            <div className="inf">
              <span className="fn" title={j.garment_path}>
                {j.garment_path.split(/[\\/]/).pop()} · {j.view}
                {j.kind !== 'generate' ? ' · ' + j.kind.replace('_', ' ') : ''}
              </span>
              <span className={'pill ' + j.status}>
                {(j.status === 'running' || j.status === 'uploading') && <span className="spin" />}
                {ST_LABEL[j.status]}
                {j.quality === 'high' ? ' · H' : ''}
              </span>
              {j.status === 'failed' && (
                <>
                  <span className="err-tip" title={j.error}>{j.error}</span>
                  <button className="retry-mini" onClick={() => window.api.invoke('job:retry', { jobId: j.id })}>🔁 Retry</button>
                </>
              )}
              {j.status === 'done' && (
                <div className="minis">
                  <button className="edit-mini" onClick={() => openEditor(j.id)}>🎨 Edit</button>
                  {j.quality !== 'high' && (
                    <button
                      className="edit-mini hi"
                      title="เจนรูปนี้ใหม่เป็น High ฿1.5"
                      onClick={async () => {
                        await window.api.invoke('job:regenHigh', { jobId: j.id })
                        showToast('ส่งเจนใหม่เป็น High แล้ว — ดูสถานะในรายการ')
                      }}
                    >
                      ↻ High
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
