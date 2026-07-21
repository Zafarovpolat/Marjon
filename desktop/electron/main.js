const { app, BrowserWindow, ipcMain, shell } = require('electron')
const { join } = require('path')
const net = require('net')
const os = require('os')
const { WebSocketServer } = require('ws')

const isDev = process.env.NODE_ENV === 'development'

// ── Local network WebSocket server ────────────────────────────────────────────
// Mobile devices connect to this server via ws://192.168.x.x:8765
// Desktop relays kitchen events from cloud to connected mobile clients

const LOCAL_WS_PORT = 8765
let localWsServer = null
const localClients = new Set()

function getLocalIp() {
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address
    }
  }
  return '127.0.0.1'
}

function startLocalWsServer() {
  if (localWsServer) return { ip: getLocalIp(), port: LOCAL_WS_PORT }
  localWsServer = new WebSocketServer({ port: LOCAL_WS_PORT })

  localWsServer.on('connection', (ws) => {
    localClients.add(ws)
    // Inform the mobile client it's connected
    ws.send(JSON.stringify({ event: '__connected__', data: { port: LOCAL_WS_PORT } }))
    ws.on('close',  () => localClients.delete(ws))
    ws.on('error',  () => localClients.delete(ws))
    // Keepalive pong
    ws.on('message', (msg) => { if (msg.toString() === 'ping') ws.send('pong') })
  })

  console.log(`[LocalWS] Listening on ws://${getLocalIp()}:${LOCAL_WS_PORT}`)
  return { ip: getLocalIp(), port: LOCAL_WS_PORT }
}

function stopLocalWsServer() {
  localWsServer?.close()
  localWsServer = null
  localClients.clear()
}

function broadcastLocal(event, data) {
  const msg = JSON.stringify({ event, data })
  for (const ws of localClients) {
    if (ws.readyState === 1 /* OPEN */) ws.send(msg)
  }
}

// ── Printer TCP helpers ───────────────────────────────────────────────────────

function printRaw(ip, port, data, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, ip, () => {
      socket.write(data, (err) => {
        socket.end()
        if (err) reject(new Error(`Write error: ${err.message}`))
        else resolve()
      })
    })
    socket.setTimeout(timeout)
    socket.on('timeout', () => { socket.destroy(); reject(new Error(`Timeout ${ip}:${port}`)) })
    socket.on('error', (err) => reject(new Error(`${ip}:${port} — ${err.message}`)))
  })
}

function pingPrinter(ip, port = 9100) {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, ip, () => { socket.end(); resolve(true) })
    socket.setTimeout(3000)
    socket.on('timeout', () => { socket.destroy(); resolve(false) })
    socket.on('error', () => resolve(false))
  })
}

// ── Window ────────────────────────────────────────────────────────────────────

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Start local WS server immediately so mobile devices can connect
  startLocalWsServer()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopLocalWsServer()
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC: Printing ─────────────────────────────────────────────────────────────

ipcMain.handle('printer:print', async (_event, { ip, port, payloadBase64, copies = 1 }) => {
  const raw = Buffer.from(payloadBase64, 'base64')
  for (let i = 0; i < copies; i++) {
    await printRaw(ip, port ?? 9100, raw)
  }
})

ipcMain.handle('printer:ping', async (_event, { ip, port }) => {
  return await pingPrinter(ip, port ?? 9100)
})

// ── IPC: Local WebSocket server ───────────────────────────────────────────────

ipcMain.handle('localws:info', () => ({
  ip: getLocalIp(),
  port: LOCAL_WS_PORT,
  clients: localClients.size,
  running: localWsServer !== null,
}))

ipcMain.handle('localws:broadcast', (_event, { event, data }) => {
  broadcastLocal(event, data)
})
