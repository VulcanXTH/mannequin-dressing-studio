import { app, BrowserWindow, protocol, net } from 'electron'
import path from 'path'
import { pathToFileURL } from 'url'
import { initDb } from './db'
import { registerIpc } from './ipc'
import { QueueManager } from './queueManager'
import { prepareImage } from './falClient'
import { initUpdater } from './updater'

protocol.registerSchemesAsPrivileged([{ scheme: 'media', privileges: { stream: true } }])

let win = null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: 'Mannequin Dressing Studio',
    backgroundColor: '#1C1B20',
    webPreferences: { preload: path.join(__dirname, '../preload/index.js') }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  // เสิร์ฟไฟล์รูปในเครื่องให้ <img> ใน renderer (thumbnail grid)
  const thumbCache = new Map()
  protocol.handle('media', async (req) => {
    let p = decodeURIComponent(new URL(req.url).pathname)
    if (process.platform === 'win32') p = p.replace(/^\//, '')
    if (/\.hei[cf]$/i.test(p)) {
      // Chromium แสดง HEIC ใน <img> ไม่ได้ — แปลงเป็น JPEG ให้ที่นี่ (BUG-4 จาก QA Windows)
      if (!thumbCache.has(p)) {
        if (thumbCache.size > 200) thumbCache.clear()
        const { buffer } = await prepareImage(p)
        thumbCache.set(p, buffer)
      }
      return new Response(thumbCache.get(p), { headers: { 'content-type': 'image/jpeg' } })
    }
    return net.fetch(pathToFileURL(p).toString())
  })

  const db = initDb(app.getPath('userData'))
  const qm = new QueueManager(db, () => {
    if (win && !win.isDestroyed()) win.webContents.send('jobs-changed')
  })
  registerIpc(db, qm, () => win)
  createWindow()
  qm.start()
  initUpdater(() => win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => app.quit())
