import React, { useEffect, useState, useCallback } from 'react'
import Generate from './screens/Generate'
import Dashboard from './screens/Dashboard'
import Editor from './screens/Editor'
import Settings from './screens/Settings'

const NAVS = [
  ['gen', 'สร้างภาพ (Generate)'],
  ['dash', 'ติดตามงาน (Dashboard)'],
  ['edit', 'แก้ไขภาพ (Editor)'],
  ['set', 'ตั้งค่า (Settings)']
]

export default function App() {
  const [screen, setScreen] = useState('gen')
  const [config, setConfig] = useState(null) // { settings, prices }
  const [batchId, setBatchId] = useState(null)
  const [editorJobId, setEditorJobId] = useState(null)
  const [toast, setToast] = useState(null)
  const [updateVersion, setUpdateVersion] = useState(null)

  const reloadConfig = useCallback(async () => {
    setConfig(await window.api.invoke('settings:get'))
  }, [])

  useEffect(() => {
    reloadConfig()
    window.api.invoke('batches:list').then((bs) => {
      if (bs.length) setBatchId(bs[0].id)
    })
    return window.api.on('update:available', (d) => setUpdateVersion(d.version))
  }, [reloadConfig])

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }, [])

  if (!config) return null
  const { settings } = config

  const openEditor = (jobId) => {
    setEditorJobId(jobId)
    setScreen('edit')
  }

  return (
    <div className="body">
      <nav className="sidebar">
        {NAVS.map(([id, label]) => (
          <button key={id} className={'nav' + (screen === id ? ' on' : '')} onClick={() => setScreen(id)}>
            {label}
          </button>
        ))}
        {updateVersion && (
          <button className="nav" style={{ color: 'var(--ok)', fontWeight: 600 }} onClick={() => setScreen('set')}>
            ⬆ เวอร์ชันใหม่ v{updateVersion}
          </button>
        )}
        <div className="side-foot">
          API Key 1 {settings.apiKey1 ? <b>● พร้อมใช้</b> : <span style={{ color: 'var(--bad)' }}>○ ยังไม่ได้ใส่</span>}
          <br />
          API Key 2 {settings.apiKey2 ? <b>● พร้อมใช้</b> : <span>○ ไม่ได้ใช้</span>}
          <br />
          <span style={{ color: 'var(--tx3)' }}>v{config.version}</span>
        </div>
      </nav>
      <main className="main">
        {screen === 'gen' && (
          <Generate
            config={config}
            onStarted={(id) => {
              setBatchId(id)
              setScreen('dash')
            }}
            showToast={showToast}
          />
        )}
        {screen === 'dash' && (
          <Dashboard config={config} batchId={batchId} setBatchId={setBatchId} openEditor={openEditor} showToast={showToast} />
        )}
        {screen === 'edit' && <Editor config={config} jobId={editorJobId} setJobId={setEditorJobId} showToast={showToast} />}
        {screen === 'set' && <Settings config={config} onSaved={reloadConfig} showToast={showToast} />}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
