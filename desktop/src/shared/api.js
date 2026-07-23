import axios from 'axios'

function baseURL() {
  return localStorage.getItem('marjon_server_url') || 'http://localhost:8000/api/v1'
}

export const api = axios.create()

api.interceptors.request.use((config) => {
  config.baseURL = baseURL()
  const token = localStorage.getItem('marjon_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    // На эндпоинтах авторизации 401 — это неверные креды, а не протухшая сессия.
    // Не сносим токен и не перезагружаем — даём странице показать ошибку.
    const url = err.config?.url || ''
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/pin-login')
    if (err.response?.status === 401 && !isAuthEndpoint) {
      localStorage.removeItem('marjon_token')
      window.location.reload()
    }
    return Promise.reject(err)
  }
)

export const auth = {
  // Бэкенд принимает email ИЛИ phone. Определяем по вводу.
  login: (identifier, password) => {
    const id = String(identifier || '').trim()
    const isPhone = !id.includes('@') && /^\+?[\d\s()\-]{5,}$/.test(id)
    const body = isPhone
      ? { phone: id.replace(/[\s()\-]/g, ''), password }
      : { email: id, password }
    return api.post('/auth/login', body).then((r) => r.data)
  },
  // Список сотрудников филиала (для выбора перед PIN-входом).
  // До входа сотрудника marjon_token отсутствует — авторизуемся org-токеном терминала.
  staffUsers: (branchId) => {
    const orgToken = localStorage.getItem('marjon_org_token')
    return api
      .get('/auth/staff-users', {
        params: { branch_id: branchId },
        headers: orgToken ? { Authorization: `Bearer ${orgToken}` } : {},
      })
      .then((r) => r.data)
  },
  // PIN-вход сотрудника. Терминал привязан к организации админ-токеном:
  // бэкенд /auth/pin-login достаёт company_id из этого токена и ищет PIN внутри неё.
  // Шлём именно org-токен — обычный marjon_token на экране PIN-входа отсутствует.
  loginByPin: (pin) => {
    const orgToken = localStorage.getItem('marjon_org_token')
    return api
      .post('/auth/pin-login', { pin }, {
        headers: orgToken ? { Authorization: `Bearer ${orgToken}` } : {},
      })
      .then((r) => r.data)
  },
  me: () => api.get('/auth/me').then((r) => r.data),
}

export const companies = {
  branches: () => api.get('/companies/me/branches').then((r) => r.data),
}

export const printers = {
  list: () => api.get('/printers').then((r) => r.data),
  jobDone: (jobId) => api.post(`/printers/jobs/${jobId}/done`).then((r) => r.data),
  printReceipt: (data) => api.post('/printers/print/receipt', data).then((r) => r.data),
  printKitchen: (data) => api.post('/printers/print/kitchen', data).then((r) => r.data),
}

export const orders = {
  list: (params) => api.get('/pos/orders', { params }).then((r) => r.data),
  get: (id) => api.get(`/pos/orders/${id}`).then((r) => r.data),
  create: (data) => api.post('/pos/orders', data).then((r) => r.data),
  update: (id, data) => api.patch(`/pos/orders/${id}`, data).then((r) => r.data),
  addItem: (orderId, data) => api.post(`/pos/orders/${orderId}/items`, data).then((r) => r.data),
  removeItem: (orderId, itemId) => api.delete(`/pos/orders/${orderId}/items/${itemId}`).then((r) => r.data),
  updateStatus: (id, status) => api.patch(`/pos/orders/${id}/status`, { status }).then((r) => r.data),
  cancel: (id) => api.delete(`/pos/orders/${id}`).then((r) => r.data),
}

export const kitchen = {
  orders: (branchId) =>
    api.get('/kitchen/orders', { params: { branch_id: branchId } }).then((r) => r.data),
  stations: () => api.get('/kitchen/stations').then((r) => r.data),
  itemStatus: (itemId, status) =>
    api.patch('/kitchen/orders/items/status', { order_item_id: itemId, status }).then((r) => r.data),
  itemDone: (itemId) =>
    api.patch('/kitchen/orders/items/status', { order_item_id: itemId, status: 'ready' }).then((r) => r.data),
  itemStart: (itemId) =>
    api.patch('/kitchen/orders/items/status', { order_item_id: itemId, status: 'cooking' }).then((r) => r.data),
  // Весь заказ готов → бэкенд ставит статус ready и рассылает событие (уведомление официанту)
  orderReady: (orderId) =>
    api.patch(`/kitchen/orders/${orderId}/ready`).then((r) => r.data),
}

export const menu = {
  products: (params) => api.get('/inventory/products', { params }).then((r) => r.data),
  categories: () => api.get('/inventory/categories').then((r) => r.data),
  product: (id) => api.get(`/inventory/products/${id}`).then((r) => r.data),
}

// Залы (зоны) с вложенными столами: GET /halls?branch_id= → [{id,name,tables:[{id,number,capacity}]}]
export const halls = {
  list: (branchId) => api.get('/halls', { params: { branch_id: branchId } }).then((r) => r.data),
  branchTables: (branchId) => api.get(`/halls/branch/${branchId}/tables`).then((r) => r.data),
}
// Обратная совместимость со старым импортом `tables`
export const tables = {
  list: (branchId) => api.get(`/halls/branch/${branchId}/tables`).then((r) => r.data),
  halls: (branchId) => api.get('/halls', { params: { branch_id: branchId } }).then((r) => r.data),
}

export const finance = {
  shifts: (params) => api.get('/finance/shifts', { params }).then((r) => r.data),
  openShift: (data) => api.post('/finance/shifts/open', data).then((r) => r.data),
  closeShift: (shiftId) => api.post(`/finance/shifts/${shiftId}/close`).then((r) => r.data),
  currentShift: () => api.get('/finance/shifts/current').then((r) => r.data),
  incomeExpense: (params) => api.get('/finance/income-expense', { params }).then((r) => r.data),
  addIncome: (data) => api.post('/finance/income-expense', { ...data, direction: 'income' }).then((r) => r.data),
  addExpense: (data) => api.post('/finance/income-expense', { ...data, direction: 'expense' }).then((r) => r.data),
}

export const reports = {
  sales: (params) => api.get('/reports/sales', { params }).then((r) => r.data),
  products: (params) => api.get('/reports/products', { params }).then((r) => r.data),
  staff: (params) => api.get('/reports/staff', { params }).then((r) => r.data),
}

export const stopList = {
  list: (branchId) => api.get('/inventory/stop-list', { params: { branch_id: branchId } }).then((r) => r.data),
  add: (productId, branchId) => api.post('/inventory/stop-list', { product_id: productId, branch_id: branchId }).then((r) => r.data),
  remove: (id) => api.delete(`/inventory/stop-list/${id}`).then((r) => r.data),
}
