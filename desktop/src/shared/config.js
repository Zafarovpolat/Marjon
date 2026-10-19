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
