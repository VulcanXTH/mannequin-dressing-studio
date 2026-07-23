const { contextBridge, ipcRenderer } = require('electron')

const EVENT_CHANNELS = new Set(['jobs-changed', 'update:available', 'update:progress', 'update:downloaded', 'update:error'])

contextBridge.exposeInMainWorld('api', {
  invoke: (channel, args) => ipcRenderer.invoke(channel, args),
  onJobsChanged: (cb) => {
    const fn = () => cb()
    ipcRenderer.on('jobs-changed', fn)
    return () => ipcRenderer.removeListener('jobs-changed', fn)
  },
  on: (channel, cb) => {
    if (!EVENT_CHANNELS.has(channel)) return () => {}
    const fn = (_e, data) => cb(data)
    ipcRenderer.on(channel, fn)
    return () => ipcRenderer.removeListener(channel, fn)
  }
})
