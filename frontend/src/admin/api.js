import axios from "axios";
import {
  AUTH_STORAGE_KEYS,
  AUTH_SCOPES,
  clearAuthTokens,
  getAccessToken,
  handleAuthResponseError,
  prepareAuthRequest,
  resolveAdminAuthSession,
  saveAuthTokens,
} from "../auth/session";
import { createFetchAdapter, DEFAULT_HTTP_TIMEOUT_MS } from "../api/transport";

export const ADMIN_API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL || "http://127.0.0.1:8000/api/v1";
const LOCAL_ADMIN_PHONE = "+998900078779";
const LOCAL_ADMIN_PASSWORD = "102938";

export const adminApi = axios.create({
  baseURL: ADMIN_API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: DEFAULT_HTTP_TIMEOUT_MS,
  adapter: createFetchAdapter({ defaultTimeout: DEFAULT_HTTP_TIMEOUT_MS }),
});

adminApi.interceptors.request.use((config) => {
  const session = config._authScope
    ? { scope: config._authScope, accessToken: getAccessToken({ scope: config._authScope }) }
    : resolveAdminAuthSession();
  return prepareAuthRequest(config, { scope: session.scope, accessToken: session.accessToken });
});

adminApi.interceptors.response.use(
  (response) => response,
  (error) => handleAuthResponseError(error, {
    client: adminApi,
    baseURL: ADMIN_API_BASE_URL,
    resolveScope: resolveAdminAuthSession,
  }),
);

function normalizeAdminPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 9) return `+998${digits}`;
  return digits.startsWith("998") ? `+${digits}` : `+${digits}`;
}

function isLocalAdminHost() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function isLocalAdminCredential(phone, password) {
  return isLocalAdminHost() && phone === LOCAL_ADMIN_PHONE && String(password) === LOCAL_ADMIN_PASSWORD;
}

export async function adminLogin(phone, password) {
  const normalizedPhone = normalizeAdminPhone(phone);

  try {
    const { data } = await adminApi.post("/auth/login", { phone: normalizedPhone, password });
    saveAuthTokens(data, { scope: AUTH_SCOPES.ADMIN });
    localStorage.removeItem("admin_local_login");
    return data;
  } catch (error) {
    if (isLocalAdminCredential(normalizedPhone, password)) {
      localStorage.removeItem("admin_local_login");
    }
    throw error;
  }
}

export function adminLogout() {
  clearAuthTokens({ scope: AUTH_SCOPES.ADMIN });
  localStorage.removeItem("admin_local_login");
}

export function isAdminAuthenticated() {
  return Boolean(resolveAdminAuthSession().accessToken)
    || Boolean(localStorage.getItem(AUTH_STORAGE_KEYS.adminAccessToken));
}
