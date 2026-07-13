import { useState, useEffect } from 'react'
import { Printer } from 'lucide-react'

export default function PrinterStatus({ printerMap }) {
  const [statuses, setStatuses] = useState({})

  useEffect(() => {
    const printerList = Object.values(printerMap)
    if (!printerList.length) return

    printerList.forEach(async (p) => {
      if (!p.ip_address || !window.electron) return
      const ok = await window.electron.pingPrinter({ ip: p.ip_address, port: p.port })
      setStatuses((prev) => ({ ...prev, [p.id]: ok }))
    })
  }, [printerMap])

  const total = Object.keys(printerMap).length
  const online = Object.values(statuses).filter(Boolean).length

  if (!total) return null

  return (
    <div className="printer-status" title={`Принтеры: ${online}/${total} онлайн`}>
      <Printer size={16} />
      <span className={online === total ? 'status-ok' : 'status-warn'}>
        {online}/{total}
      </span>
    </div>
  )
}
