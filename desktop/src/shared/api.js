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
    if (err.response?.status === 401) {
      localStorage.removeItem('marjon_token')
      window.location.reload()
    }
    return Promise.reject(err)
  }
)

export const auth = {
  // Backend field is "email" (also accepts username); "phone" was wrong
  login: (email, password) =>
    api.post('/auth/login', { email, password }).then((r) => r.data),
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
  itemDone: (itemId) =>
    api.patch('/kitchen/orders/items/status', { order_item_id: itemId, status: 'ready' }).then((r) => r.data),
}

export const menu = {
  // Inventory products/categories — what POS actually uses for ordering
  products: () => api.get('/inventory/products').then((r) => r.data),
  categories: () => api.get('/inventory/categories').then((r) => r.data),
}
