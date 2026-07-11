const { contextBridge, ipcRenderer } = require('electron')

/**
 * Exposes a safe subset of Electron APIs to the renderer (React).
 * Nothing from Node.js leaks through — only these explicit methods.
 */
contextBridge.exposeInMainWorld('electron', {
  /**
   * Send raw ESC/POS bytes (base64) to a network printer.
   * @param {{ ip: string, port?: number, payloadBase64: string, copies?: number }} args
   */
  print: (args) => ipcRenderer.invoke('printer:print', args),

  /**
   * Check if a printer is reachable on the network.
   * @param {{ ip: string, port?: number }} args
   * @returns {Promise<boolean>}
   */
  pingPrinter: (args) => ipcRenderer.invoke('printer:ping', args),
})
