/**
 * WebSocket client for real-time print job delivery.
 * Connects to: ws://server/api/v1/printers/ws/{branchId}?token=JWT
 */

let socket = null
let reconnectTimer = null
const listeners = new Set()

export function connectPrinterWS(serverUrl, token, branchId) {
  if (socket) {
    socket.close()
    socket = null
  }

  const wsUrl = serverUrl
    .replace(/^http/, 'ws')
    .replace(/\/api\/v1\/?$/, '')
  const url = `${wsUrl}/api/v1/printers/ws/${branchId}?token=${token}`

  socket = new WebSocket(url)

  socket.onopen = () => {
    console.log('[WS] Connected to print hub')
    clearTimeout(reconnectTimer)
    // keepalive ping every 30s
    reconnectTimer = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) socket.send('ping')
    }, 30_000)
  }

  socket.onmessage = (event) => {
    if (event.data === 'pong') return
    try {
      const msg = JSON.parse(event.data)
      listeners.forEach((fn) => fn(msg))
    } catch {
      // ignore non-JSON frames
    }
  }

  socket.onclose = () => {
    console.log('[WS] Disconnected — reconnecting in 5s')
    clearInterval(reconnectTimer)
    reconnectTimer = setTimeout(() => connectPrinterWS(serverUrl, token, branchId), 5_000)
  }

  socket.onerror = (err) => console.error('[WS] Error', err)
}

export function disconnectPrinterWS() {
  clearTimeout(reconnectTimer)
  clearInterval(reconnectTimer)
  socket?.close()
  socket = null
}

/** Register a callback for incoming WS messages. Returns an unsubscribe fn. */
export function onPrintJob(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}
