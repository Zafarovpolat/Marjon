const net = require('net')

/**
 * Send raw ESC/POS bytes to a network thermal printer via TCP.
 * @param {string} ip
 * @param {number} port  - typically 9100
 * @param {Buffer} data  - raw ESC/POS bytes
 * @param {number} [timeout=5000]
 * @returns {Promise<void>}
 */
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
    socket.on('timeout', () => {
      socket.destroy()
      reject(new Error(`Timeout connecting to ${ip}:${port}`))
    })
    socket.on('error', (err) => reject(new Error(`${ip}:${port} — ${err.message}`)))
  })
}

/**
 * Check if a printer is reachable (TCP handshake only, no data sent).
 * @param {string} ip
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function pingPrinter(ip, port = 9100) {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, ip, () => {
      socket.end()
      resolve(true)
    })
    socket.setTimeout(3000)
    socket.on('timeout', () => { socket.destroy(); resolve(false) })
    socket.on('error', () => resolve(false))
  })
}

module.exports = { printRaw, pingPrinter }
