import { ipcMain, shell, app, BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater
const RELEASES_URL = 'https://github.com/VulcanXTH/mannequin-dressing-studio/releases/latest'

// Windows: โหลด + ติดตั้งอัตโนมัติเต็มรูปแบบ
// macOS: แอป unsigned ติดตั้งทับอัตโนมัติไม่ได้ — แจ้งเตือน + เปิดหน้าดาวน์โหลดแทน
export function initUpdater(getWin) {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  const send = (ch, data) => {
    const w = getWin()
    if (w && !w.isDestroyed()) w.webContents.send(ch, data)
  }
  autoUpdater.on('update-available', (info) => send('update:available', { version: info.version }))
  autoUpdater.on('download-progress', (p) => send('update:progress', { percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', () => send('update:downloaded', {}))
  autoUpdater.on('error', (e) => send('update:error', { message: String((e && e.message) || e).slice(0, 200) }))

  ipcMain.handle('update:check', async () => {
    try {
      const r = await autoUpdater.checkForUpdates()
      return { current: app.getVersion(), latest: (r && r.updateInfo && r.updateInfo.version) || null }
    } catch (e) {
      return { current: app.getVersion(), error: String((e && e.message) || e).slice(0, 200) }
    }
  })
  ipcMain.handle('update:download', async () => {
    if (process.platform === 'darwin') {
      shell.openExternal(RELEASES_URL)
      return { external: true }
    }
    await autoUpdater.downloadUpdate()
    return { ok: true }
  })
  // ต้องบังคับปิดหน้าต่างเองก่อน quitAndInstall — ไม่งั้น NSIS ขึ้น "cannot be closed. Please close it manually"
  // (บั๊กที่เจอจริงตอนทดสอบอัปเดตบน Windows v0.1.3)
  ipcMain.handle('update:install', () => {
    setImmediate(() => {
      try {
        app.removeAllListeners('window-all-closed')
        for (const w of BrowserWindow.getAllWindows()) w.destroy()
        autoUpdater.quitAndInstall(false, true)
      } catch {
        app.quit()
      }
    })
    return { ok: true }
  })

  // เช็คเงียบๆ หลังเปิดแอป (dev mode ไม่มี app-update.yml — เงียบไว้)
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000)
}
