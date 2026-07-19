const { contextBridge, ipcRenderer } = require('electron')

/**
 * Exposes a safe subset of Electron APIs to the renderer (React).
 * Nothing from Node.js leaks through — only these explicit methods.
 */
contextBridge.exposeInMainWorld('electron', {
  // Printing
  print: (args) => ipcRenderer.invoke('printer:print', args),
  pingPrinter: (args) => ipcRenderer.invoke('printer:ping', args),

  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
  setKiosk: (enabled) => ipcRenderer.invoke('window:setKiosk', enabled),
  isFullscreen: () => ipcRenderer.invoke('window:isFullscreen'),
})
