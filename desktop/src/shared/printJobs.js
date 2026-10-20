// ── PRINT-LAT-01: печать задания на терминале ────────────────────────────────
//
// Задание на печать приходит двумя путями:
//   1) по WebSocket (быстро, но соединение может быть в переподключении);
//   2) опросом очереди GET /printers/{id}/jobs/pending (страховка).
//
// Раньше был только путь (1), и обработчик начинался с `if (!printer) return`:
// если список принтеров ещё не загрузился или WS отвалился, задание молча
// оставалось в pending — чек не выходил вообще. Плюс оба пути могут принести
// одно и то же задание, поэтому здесь дедупликация по job_id.
import { printers as printersApi } from './api'

const handled = new Set()
const HANDLED_LIMIT = 200

function remember(jobId) {
  handled.add(jobId)
  if (handled.size > HANDLED_LIMIT) {
    const oldest = handled.values().next().value
    handled.delete(oldest)
  }
}

/**
 * Печатает одно задание и закрывает его на сервере (done/fail).
 * printer может быть undefined — тогда ip/port берутся из самого задания.
 * Возвращает true, если задание действительно напечатано.
 */
export async function printJob(job, printer) {
  const jobId = job?.job_id || job?.id
  if (!jobId || handled.has(jobId)) return false

  // PRINT-ADDR-01: адрес берём из САМОГО задания, а не из карты принтеров.
  // Карта грузится один раз при входе в режим: если владелец поменял IP принтера
  // в вебе, терминал продолжал печатать на старый адрес до перезапуска, а в
  // задании сервер уже прислал актуальный ip/port (он рендерил чек для него).
  // Карта остаётся запасным источником — на случай старых заданий без адреса.
  const ip = job?.ip_address || printer?.ip_address
  const port = job?.port ?? printer?.port ?? 9100

  // Печатать нечем — снимаем задание с очереди, иначе оно будет приходить
  // при каждом опросе и создавать видимость «печатает через раз».
  if (!ip || !window.electron?.print) {
    remember(jobId)
    try {
      await printersApi.jobFail(jobId, !ip ? 'no printer ip' : 'electron print unavailable')
    } catch {
      /* сеть недоступна — задание просто останется в очереди */
    }
    return false
  }

  try {
    await window.electron.print({
      ip,
      port,
      payloadBase64: job.payload,
      copies: job.copies ?? 1,
    })
    remember(jobId)
    await printersApi.jobDone(jobId)
    return true
  } catch (err) {
    remember(jobId)
    try {
      await printersApi.jobFail(jobId, String(err?.message || err))
    } catch {
      /* игнорируем: главное — не зациклить печать */
    }
    throw err
  }
}

/**
 * Опрос очереди печати. getPrinterMap() должен возвращать { [id]: printer }.
 * Возвращает функцию остановки.
 */
export function startPrintPoller(getPrinterMap, { intervalMs = 5000, onError } = {}) {
  let stopped = false

  async function tick() {
    if (stopped) return
    const map = getPrinterMap() || {}
    for (const printer of Object.values(map)) {
      let jobs = []
      try {
        jobs = await printersApi.pendingJobs(printer.id)
      } catch {
        continue // сервер недоступен — попробуем на следующем тике
      }
      for (const job of Array.isArray(jobs) ? jobs : []) {
        try {
          await printJob({ ...job, printer_id: printer.id }, printer)
        } catch (err) {
          onError?.(err)
        }
      }
    }
  }

  const timer = setInterval(tick, intervalMs)
  tick()
  return () => {
    stopped = true
    clearInterval(timer)
  }
}
