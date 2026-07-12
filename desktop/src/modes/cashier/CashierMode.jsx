import { useEffect, useState, useCallback } from 'react'
import { ArrowLeft } from 'lucide-react'
import { orders, printers as printersApi } from '../../shared/api'
import { onPrintJob } from '../../shared/ws'
import PrinterStatus from '../../components/PrinterStatus'

const ACTIVE_STATUSES = new Set(['new', 'accepted', 'cooking', 'ready'])

export default function CashierMode({ user, onBack, onLogout }) {
  const [orderList, setOrderList] = useState([])
  const [printerMap, setPrinterMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    printersApi.list().then((list) => {
      const map = {}
      list.forEach((p) => { map[p.id] = p })
      setPrinterMap(map)
    }).catch(console.error)
  }, [])

  const loadOrders = useCallback(() => {
    orders.list({ branch_id: user.branch_id })
      .then((data) => {
        const all = data.items ?? data
        setOrderList(all.filter((o) => ACTIVE_STATUSES.has(o.status)))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user.branch_id])

  useEffect(() => { loadOrders() }, [loadOrders])

  // Handle incoming print jobs from WebSocket
  useEffect(() => {
    return onPrintJob(async (msg) => {
      if (msg.event !== 'print_job') return
      const printer = printerMap[msg.printer_id]
      if (!printer) return

      try {
        await window.electron.print({
          ip: printer.ip_address,
          port: printer.port ?? 9100,
          payloadBase64: msg.payload,
          copies: msg.copies ?? 1,
        })
        await printersApi.jobDone(msg.job_id)
      } catch (err) {
        console.error('[print]', err)
      }
    })
  }, [printerMap])

  async function handlePrintReceipt(orderId) {
    const receiptPrinter = Object.values(printerMap).find(
      (p) => p.printer_type === 'receipt' && p.branch_id === user.branch_id
    )
    if (!receiptPrinter) {
      alert('Принтер чеков не найден')
      return
    }
    try {
      await printersApi.printReceipt({ order_id: orderId, printer_id: receiptPrinter.id, copies: 1 })
    } catch (err) {
      console.error('[receipt]', err)
      alert('Ошибка печати чека')
    }
  }

  return (
    <div className="mode-layout">
      <header className="mode-topbar">
        <button className="icon-btn" onClick={onBack}><ArrowLeft size={20} /></button>
        <h2>Касса</h2>
        <PrinterStatus printerMap={printerMap} />
      </header>

      <main className="cashier-main">
        {loading ? (
          <p className="loading-text">Загрузка заказов...</p>
        ) : orderList.length === 0 ? (
          <p className="empty-text">Нет открытых заказов</p>
        ) : (
          <div className="order-grid">
            {orderList.map((order) => (
              <div key={order.id} className="order-card">
                <div className="order-card-header">
                  <span className="order-number">#{order.order_number}</span>
                  <span className={`order-status status-${order.status}`}>{order.status}</span>
                </div>
                {order.table_number && (
                  <p className="order-table">Стол {order.table_number}</p>
                )}
                <p className="order-total">{Number(order.total_amount).toLocaleString()} сум</p>
                <button
                  className="btn-primary"
                  onClick={() => handlePrintReceipt(order.id)}
                >
                  Печать чека
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
