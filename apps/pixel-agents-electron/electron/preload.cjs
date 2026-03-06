const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pixelAgentsHost', {
  postMessage(message) {
    ipcRenderer.send('pixel-agents:renderer-message', message)
  },
  onMessage(listener) {
    if (typeof listener !== 'function') {
      return () => {}
    }
    const wrapped = (_event, payload) => {
      listener(payload)
    }
    ipcRenderer.on('pixel-agents:host-message', wrapped)
    return () => {
      ipcRenderer.removeListener('pixel-agents:host-message', wrapped)
    }
  },
})

