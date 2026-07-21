const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  /** Send raw ESC/POS bytes (base64) to a network printer. */
  print: (args) => ipcRenderer.invoke('printer:print', args),

  /** Check if a printer is reachable. */
  pingPrinter: (args) => ipcRenderer.invoke('printer:ping', args),

  /**
   * Local network WebSocket server API.
   * Mobile devices connect to ws://{ip}:{port} on the LAN.
   */
  localWS: {
    /** Returns { ip, port, clients, running } */
    info: () => ipcRenderer.invoke('localws:info'),
    /** Broadcast a kitchen event to all connected mobile clients. */
    broadcast: (event, data) => ipcRenderer.invoke('localws:broadcast', { event, data }),
  },
})
