const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  invoke: (channel, args) => ipcRenderer.invoke(channel, args),
  onJobsChanged: (cb) => {
    const fn = () => cb()
    ipcRenderer.on('jobs-changed', fn)
    return () => ipcRenderer.removeListener('jobs-changed', fn)
  }
})
