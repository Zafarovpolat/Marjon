import {
  AUTH_SCOPES,
  clearAuthTokens,
  getAccessToken,
  saveAuthTokens,
} from "../auth/session";
import { normalizeTokenResponse } from "../api/normalizers";
import { createApiTransport } from "../api/transport";

export const ADMIN_API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL || "http://127.0.0.1:8000/api/v1";

export const adminApi = createApiTransport({
  baseURL: ADMIN_API_BASE_URL,
  scope: AUTH_SCOPES.ADMIN,
});

function normalizeAdminPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 9) return `+998${digits}`;
  return digits.startsWith("998") ? `+${digits}` : `+${digits}`;
}

export async function adminLogin(phone, password) {
  const normalizedPhone = normalizeAdminPhone(phone);
  const { data } = await adminApi.post("/auth/login", { phone: normalizedPhone, password });
  const tokens = normalizeTokenResponse(data);
  saveAuthTokens(tokens, { scope: AUTH_SCOPES.ADMIN });
  return tokens;
}

export function adminLogout() {
  clearAuthTokens({ scope: AUTH_SCOPES.ADMIN });
}

export function isAdminAuthenticated() {
  return Boolean(getAccessToken({ scope: AUTH_SCOPES.ADMIN }));
}
