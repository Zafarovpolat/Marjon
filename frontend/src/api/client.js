import {
  AUTH_SCOPES,
  getAccessToken as readAccessToken,
  hasAccessToken,
  logoutAuthSession,
  saveAuthTokens,
  waitForAuthLogout,
} from "../auth/session";
import { normalizeTokenResponse } from "./normalizers";
import { createApiTransport } from "./transport";

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

export const api = createApiTransport({
  baseURL: API_BASE_URL,
  scope: AUTH_SCOPES.DEFAULT,
});

export async function login(email, password) {
  await waitForAuthLogout({ scope: AUTH_SCOPES.DEFAULT });
  const { data } = await api.post("/auth/login", { email, password });
  const tokens = normalizeTokenResponse(data);
  saveTokens(tokens);
  return tokens;
}

export async function loginByPhone(phone, password) {
  await waitForAuthLogout({ scope: AUTH_SCOPES.DEFAULT });
  const { data } = await api.post("/auth/login", { phone, password });
  const tokens = normalizeTokenResponse(data);
  saveTokens(tokens);
  return tokens;
}

export async function loginByPin(employee_id, pin) {
  await waitForAuthLogout({ scope: AUTH_SCOPES.DEFAULT });
  const { data } = await api.post("/auth/pin-login", { employee_id, pin });
  const tokens = normalizeTokenResponse(data);
  saveTokens(tokens);
  return tokens;
}

export async function fetchStaffUsers() {
  const { data } = await api.get("/auth/staff-users");
  return data;
}

function saveTokens(data) {
  saveAuthTokens(data, { scope: AUTH_SCOPES.DEFAULT });
}

export async function logout() {
  return logoutAuthSession({
    scope: AUTH_SCOPES.DEFAULT,
    revoke: (refreshToken, accessToken) => api.post(
      "/auth/logout",
      { refresh_token: refreshToken },
      accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
    ),
  });
}

export function isAuthenticated() {
  return hasAccessToken({ scope: AUTH_SCOPES.DEFAULT });
}

export function getAccessToken() {
  return readAccessToken({ scope: AUTH_SCOPES.DEFAULT });
}

export function formatMoney(value, currency = "UZS") {
  const number = Number(value || 0);
  return `${number.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ${currency}`;
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}
