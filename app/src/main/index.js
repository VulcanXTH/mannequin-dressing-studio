import { app, BrowserWindow, protocol, net } from 'electron'
import path from 'path'
import { pathToFileURL } from 'url'
import { initDb } from './db'
import { registerIpc } from './ipc'
import { QueueManager } from './queueManager'

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
  protocol.handle('media', (req) => {
    let p = decodeURIComponent(new URL(req.url).pathname)
    if (process.platform === 'win32') p = p.replace(/^\//, '')
    return net.fetch(pathToFileURL(p).toString())
  })

  const db = initDb(app.getPath('userData'))
  const qm = new QueueManager(db, () => {
    if (win && !win.isDestroyed()) win.webContents.send('jobs-changed')
  })
  registerIpc(db, qm, () => win)
  createWindow()
  qm.start()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => app.quit())
