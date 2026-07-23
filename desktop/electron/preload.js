const { contextBridge, ipcRenderer } = require('electron')

/**
 * Exposes a safe subset of Electron APIs to the renderer (React).
 * Nothing from Node.js leaks through — only these explicit methods.
 */
contextBridge.exposeInMainWorld('electron', {
  // ── Printing ────────────────────────────────────────────────────────────────
  print: (args) => ipcRenderer.invoke('printer:print', args),
  pingPrinter: (args) => ipcRenderer.invoke('printer:ping', args),

  // ── Window controls (existing) ───────────────────────────────────────────────
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
  setKiosk: (enabled) => ipcRenderer.invoke('window:setKiosk', enabled),
  isFullscreen: () => ipcRenderer.invoke('window:isFullscreen'),

  // ── Window controls (new) ────────────────────────────────────────────────────
  setFullScreen: (enabled) => ipcRenderer.invoke('window:setFullScreen', enabled),

  // ── PIN-protected exit ───────────────────────────────────────────────────────
  setLocked: (locked) => ipcRenderer.invoke('window:setLocked', locked),
  allowCloseOnce: () => ipcRenderer.invoke('window:allowCloseOnce'),
  // Register a callback for when the main process wants the renderer to show a PIN dialog
  onRequestExitPin: (callback) => {
    ipcRenderer.on('request-exit-pin', (_event) => callback())
  },

  // ── Zoom ─────────────────────────────────────────────────────────────────────
  zoomIn: () => ipcRenderer.invoke('window:zoomIn'),
  zoomOut: () => ipcRenderer.invoke('window:zoomOut'),
  setZoom: (factor) => ipcRenderer.invoke('window:setZoom', factor),
  getZoom: () => ipcRenderer.invoke('window:getZoom'),

  // ── Auto-launch ──────────────────────────────────────────────────────────────
  setAutoLaunch: (enabled) => ipcRenderer.invoke('app:setAutoLaunch', enabled),
})
