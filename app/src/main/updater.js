import { ipcMain, shell, app } from 'electron'
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
  // ให้ electron-updater จัดการปิดแอปเอง — quitAndInstall ปิดทุกหน้าต่าง + emit before-quit-for-update + app.quit() อยู่แล้ว
  // isSilent=true คือตัวแก้จริงของ dialog "cannot be closed / Retry": ตัวติดตั้ง NSIS จะ auto-ตอบ MessageBox
  // ด้วยค่า /SD default แทนที่จะบล็อกรอคนกด + ทำให้ isForceRunAfter (relaunch) มีผลจริง
  // (การ destroy() หน้าต่างเองไม่ช่วย เพราะ NSIS เช็คจาก process ในโฟลเดอร์ติดตั้ง ไม่ใช่หน้าต่าง — root-caused จาก source electron-builder, QA 20 ก.ค. 2026)
  ipcMain.handle('update:install', () => {
    setImmediate(() => autoUpdater.quitAndInstall(true, true)) // (isSilent, isForceRunAfter)
    return { ok: true }
  })

  // เช็คเงียบๆ หลังเปิดแอป (dev mode ไม่มี app-update.yml — เงียบไว้)
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000)
}
