const { app, BrowserWindow, ipcMain, shell } = require('electron')
const { join } = require('path')
const net = require('net')

const isDev = process.env.NODE_ENV === 'development'

// ── Printer TCP helpers (inlined to avoid Vite bundling issues) ───────────────

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
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
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
