const { app, BrowserWindow, ipcMain, shell } = require('electron')
const { join } = require('path')
const net = require('net')

const isDev = process.env.NODE_ENV === 'development' || !!process.env['ELECTRON_RENDERER_URL']

// ── Single-instance lock ──────────────────────────────────────────────────────
// В dev не завершаем процесс при отсутствии лока (electron-vite может перезапускать),
// чтобы окно не закрывалось внезапно. В проде — стандартный single-instance.

const gotLock = app.requestSingleInstanceLock()
if (!gotLock && !isDev) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// ── PIN-protected close flag ──────────────────────────────────────────────────

// In dev we default to unlocked so the window can be closed normally.
let allowClose = true   // becomes false when renderer calls window:setLocked(true)
let allowCloseOnce = false

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

  // PIN-protected close: intercept 'close' when locked
  mainWindow.on('close', (e) => {
    if (allowCloseOnce) {
      allowCloseOnce = false  // consume the one-shot flag
      return                  // allow close
    }
    if (!allowClose) {
      e.preventDefault()
      try {
        mainWindow.webContents.send('request-exit-pin')
      } catch (_) {}
    }
    // if allowClose === true, fall through → normal close
  })

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

  // ── Auto-update (production only) ────────────────────────────────────────
  if (!isDev) {
    try {
      const { autoUpdater } = require('electron-updater')
      Promise.resolve(autoUpdater.checkForUpdatesAndNotify()).catch(() => {})
    } catch (_) {
      // electron-updater not available — silently skip
    }
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC: Window controls ──────────────────────────────────────────────────────

ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize()
})

ipcMain.handle('window:toggleFullscreen', () => {
  if (!mainWindow) return
  mainWindow.setFullScreen(!mainWindow.isFullScreen())
})

ipcMain.handle('window:setKiosk', (_event, enabled) => {
  if (!mainWindow) return
  mainWindow.setKiosk(enabled)
})

ipcMain.handle('window:isFullscreen', () => {
  return mainWindow ? mainWindow.isFullScreen() : false
})

// New: set fullscreen explicitly
ipcMain.handle('window:setFullScreen', (_event, enabled) => {
  try {
    if (mainWindow) mainWindow.setFullScreen(!!enabled)
  } catch (e) {}
})

// ── IPC: PIN-protected exit ───────────────────────────────────────────────────

ipcMain.handle('window:setLocked', (_event, locked) => {
  try {
    allowClose = !locked
  } catch (e) {}
})

ipcMain.handle('window:allowCloseOnce', () => {
  try {
    allowCloseOnce = true
    if (mainWindow) mainWindow.close()
  } catch (e) {}
})

// ── IPC: Zoom ─────────────────────────────────────────────────────────────────

const ZOOM_MIN = 0.75
const ZOOM_MAX = 1.5

ipcMain.handle('window:zoomIn', () => {
  try {
    if (!mainWindow) return
    const current = mainWindow.webContents.getZoomFactor()
    const next = Math.min(ZOOM_MAX, Math.round((current + 0.1) * 100) / 100)
    mainWindow.webContents.setZoomFactor(next)
    return next
  } catch (e) {}
})

ipcMain.handle('window:zoomOut', () => {
  try {
    if (!mainWindow) return
    const current = mainWindow.webContents.getZoomFactor()
    const next = Math.max(ZOOM_MIN, Math.round((current - 0.1) * 100) / 100)
    mainWindow.webContents.setZoomFactor(next)
    return next
  } catch (e) {}
})

ipcMain.handle('window:setZoom', (_event, factor) => {
  try {
    if (!mainWindow) return
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, factor))
    mainWindow.webContents.setZoomFactor(clamped)
    return clamped
  } catch (e) {}
})

ipcMain.handle('window:getZoom', () => {
  try {
    return mainWindow ? mainWindow.webContents.getZoomFactor() : 1
  } catch (e) { return 1 }
})

// ── IPC: Auto-launch ──────────────────────────────────────────────────────────

ipcMain.handle('app:setAutoLaunch', (_event, enabled) => {
  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled })
  } catch (e) {}
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
