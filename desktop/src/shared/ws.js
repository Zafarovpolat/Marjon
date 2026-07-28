// ── Printer WebSocket ─────────────────────────────────────────────────────────
// ws://server/api/v1/printers/ws/{branchId}?token=JWT

let printerSocket = null
let printerHandle = null
const printerListeners = new Set()

export function connectPrinterWS(serverUrl, token, branchId) {
  if (printerSocket) { printerSocket.close(); printerSocket = null }

  const wsBase = serverUrl.replace(/^http/, 'ws').replace(/\/api\/v1\/?$/, '')
  const url = `${wsBase}/api/v1/printers/ws/${branchId}?token=${token}`

  function open() {
    printerSocket = new WebSocket(url)

    printerSocket.onopen = () => {
      clearTimeout(printerHandle)
      printerHandle = setInterval(() => {
        if (printerSocket?.readyState === WebSocket.OPEN) printerSocket.send('ping')
      }, 30_000)
    }

    printerSocket.onmessage = (e) => {
      if (e.data === 'pong') return
      try { printerListeners.forEach((fn) => fn(JSON.parse(e.data))) } catch {}
    }

    printerSocket.onclose = () => {
      clearInterval(printerHandle)
      printerHandle = setTimeout(open, 5_000)
    }
  }

  open()
}

export function disconnectPrinterWS() {
  clearTimeout(printerHandle)
  clearInterval(printerHandle)
  printerSocket?.close()
  printerSocket = null
}

/** Returns unsubscribe fn. */
export function onPrintJob(callback) {
  printerListeners.add(callback)
  return () => printerListeners.delete(callback)
}

// ── Kitchen WebSocket ─────────────────────────────────────────────────────────
// ws://server/ws/kitchen?token=JWT&branch_id=ID
// Events: new_order | order_updated | order_cancelled | item_status_changed

let kitchenSocket = null
let kitchenHandle = null
const kitchenListeners = new Map() // event -> Set<fn>

export function connectKitchenWS(serverUrl, token, branchId) {
  if (kitchenSocket) { kitchenSocket.close(); kitchenSocket = null }

  const wsBase = serverUrl.replace(/^http/, 'ws').replace(/\/api\/v1\/?$/, '')
  const url = `${wsBase}/ws/kitchen?token=${token}&branch_id=${branchId}`

  function open() {
    kitchenSocket = new WebSocket(url)

    kitchenSocket.onopen = () => {
      clearTimeout(kitchenHandle)
      kitchenHandle = setInterval(() => {
        if (kitchenSocket?.readyState === WebSocket.OPEN) kitchenSocket.send('ping')
      }, 25_000)
    }

    kitchenSocket.onmessage = (e) => {
      if (e.data === 'pong') return
      try {
        const msg = JSON.parse(e.data)
        const event = msg.event ?? msg.type
        if (!event) return
        const payload = msg.data ?? msg
        kitchenListeners.get(event)?.forEach((fn) => fn(payload))
        kitchenListeners.get('*')?.forEach((fn) => fn(payload))
      } catch {}
    }

    kitchenSocket.onclose = () => {
      clearInterval(kitchenHandle)
      kitchenHandle = setTimeout(open, 5_000)
    }
  }

  open()
}

export function disconnectKitchenWS() {
  clearTimeout(kitchenHandle)
  clearInterval(kitchenHandle)
  kitchenSocket?.close()
  kitchenSocket = null
}

/**
 * Subscribe to a kitchen event.
 * @param {string} event  'new_order' | 'order_updated' | 'order_cancelled' | 'item_status_changed' | '*'
 * @param {function} callback
 * @returns {function} unsubscribe
 */
export function onKitchenEvent(event, callback) {
  if (!kitchenListeners.has(event)) kitchenListeners.set(event, new Set())
  kitchenListeners.get(event).add(callback)
  return () => kitchenListeners.get(event)?.delete(callback)
}
