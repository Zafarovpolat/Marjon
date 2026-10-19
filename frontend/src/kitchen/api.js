// KDS-клиент кухни: отдельный лёгкий Axios-клиент вне админки.
// Токены хранятся отдельно (marjon_kds_*), чтобы не пересекаться с веб-админкой.
import axios from "axios";

export const KDS_API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

const ACCESS_KEY = "marjon_kds_token";
const REFRESH_KEY = "marjon_kds_refresh";

function read(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function write(key, value) {
  if (!value) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Игнорируем ошибки квоты — сессия просто не сохранится
  }
}

export function getKdsToken() {
  return read(ACCESS_KEY);
}

export function isKdsAuthenticated() {
  return Boolean(getKdsToken());
}

export function clearKdsSession() {
  try {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    // ignore
  }
}

export const kdsApi = axios.create({
  baseURL: KDS_API_BASE_URL,
  timeout: 20000,
});

// Подставляем Bearer перед каждым запросом
kdsApi.interceptors.request.use((config) => {
  const token = getKdsToken();
  config.headers = config.headers || {};
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// При 401 один раз пробуем refresh, иначе чистим сессию
kdsApi.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error?.config;
    const status = error?.response?.status;
    const url = original?.url || "";
    // Эндпоинты входа не восстанавливаем — это неверные креды, а не протухшая сессия
    if (status !== 401 || original?._kdsRetry || url.includes("/auth/login") || url.includes("/auth/refresh")) {
      return Promise.reject(error);
    }
    original._kdsRetry = true;
    const refreshToken = read(REFRESH_KEY);
    if (!refreshToken) {
      clearKdsSession();
      return Promise.reject(error);
    }
    try {
      const { data } = await axios.post(`${KDS_API_BASE_URL}/auth/refresh`, {
        refresh_token: refreshToken,
      });
      write(ACCESS_KEY, data.access_token);
      if (data.refresh_token) write(REFRESH_KEY, data.refresh_token);
      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${data.access_token}`;
      return kdsApi(original);
    } catch (e) {
      clearKdsSession();
      return Promise.reject(e);
    }
  },
);

// Вход повара: телефон или email + пароль (бэкенд принимает оба поля)
export async function kdsLogin(identifier, password) {
  const id = String(identifier || "").trim();
  const isPhone = !id.includes("@") && /^\+?[\d\s()\-]{5,}$/.test(id);
  const body = isPhone
    ? { phone: id.replace(/[\s()\-]/g, ""), password }
    : { email: id, password };
  const { data } = await kdsApi.post("/auth/login", body);
  write(ACCESS_KEY, data.access_token);
  if (data.refresh_token) write(REFRESH_KEY, data.refresh_token);
  return data;
}

export async function kdsLogout() {
  const refreshToken = read(REFRESH_KEY);
  const accessToken = read(ACCESS_KEY);
  clearKdsSession();
  if (!refreshToken) return;
  try {
    await kdsApi.post(
      "/auth/logout",
      { refresh_token: refreshToken },
      accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
    );
  } catch {
    // Выход локально уже выполнен — ошибку сервера игнорируем
  }
}

export const kdsGetMe = () => kdsApi.get("/auth/me").then((r) => r.data);

export const kdsGetBranches = () => kdsApi.get("/companies/me/branches").then((r) => r.data);

export const kdsGetOrders = (branchId) =>
  kdsApi.get("/kitchen/orders", { params: { branch_id: branchId } }).then((r) => r.data);

// Перевод позиции: pending -> cooking -> ready (цепочку проверяет бэкенд)
export const kdsSetItemStatus = (orderItemId, status) =>
  kdsApi.patch("/kitchen/orders/items/status", { order_item_id: orderItemId, status }).then((r) => r.data);

// Весь заказ готов (уведомляет официанта)
export const kdsSetOrderReady = (orderId) =>
  kdsApi.patch(`/pos/orders/${orderId}/status`, { status: "ready" }).then((r) => r.data);

// WS-URL кухни из REST-базы (http -> ws, https -> wss)
export function kdsWsUrl(branchId) {
  const token = getKdsToken();
  try {
    const url = new URL(KDS_API_BASE_URL);
    const proto = url.protocol === "https:" ? "wss:" : "ws:";
    // KDS_API_BASE_URL заканчивается на /api/v1 — путь WS идёт от корня хоста
    return `${proto}//${url.host}/ws/kitchen?token=${encodeURIComponent(token)}&branch_id=${encodeURIComponent(branchId)}`;
  } catch {
    return null;
  }
}
