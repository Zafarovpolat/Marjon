// Адрес сервера по умолчанию — то, что видит клиент в собранном установщике
// до того, как что-либо сохранено в localStorage.
//
// Раньше здесь стоял http://localhost:8000/api/v1. В exe это адрес МАШИНЫ
// КЛИЕНТА, поэтому ни один запрос не доходил до сервера, а экран входа
// показывал заглушку «Неверный телефон или пароль моноблока» — она
// подставляется на любой сетевой сбой, а не только на неверные данные
// (см. LoginPage.jsx: err.response?.data?.detail || t('lp_branch_bad_creds')).
// Для локальной разработки адрес переопределяется в desktop/.env:
//   VITE_DEFAULT_SERVER_URL=http://localhost:8000/api/v1
export const DEFAULT_SERVER_URL =
  import.meta.env.VITE_DEFAULT_SERVER_URL || 'https://api.marjon.tech/api/v1'

/**
 * Канонический адрес API.
 *
 * Клиент дописывает пути сам (`${base}/auth/monoblock-login`), поэтому адрес
 * без `/api/v1` даёт 404 Not Found прямо на входе — самая частая ошибка при
 * настройке терминала: в поле пишут `http://192.168.1.100:8000`, «Проверить
 * соединение» проходит (health лежит в корне), а вход падает с сырым
 * «Not Found». Поэтому адрес приводим к одному виду и храним уже с префиксом.
 *
 *   "192.168.1.100:8000"                 -> "http://192.168.1.100:8000/api/v1"
 *   "http://127.0.0.1:8000/"             -> "http://127.0.0.1:8000/api/v1"
 *   "https://api.marjon.tech/api/v1/"    -> "https://api.marjon.tech/api/v1"
 */
export function normalizeServerUrl(raw) {
  let value = String(raw ?? '').trim()
  if (!value) return ''
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`
  value = value.replace(/\/+$/, '')
  if (!/\/api\/v1$/i.test(value)) value = `${value}/api/v1`
  return value
}
