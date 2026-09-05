import {
  AUTH_SCOPES,
  endAuthSession,
  getAccessToken,
  HQ_AUTH_SCOPE,
  isValidatedHqProfile,
  logoutAuthSession,
  saveAuthTokens,
  waitForAuthLogout,
} from "../auth/session";
import { normalizeTokenResponse } from "../api/normalizers";
import { createApiTransport } from "../api/transport";

export const ADMIN_API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL || "http://localhost:8000/api/v1";

export const adminApi = createApiTransport({
  baseURL: ADMIN_API_BASE_URL,
  scope: AUTH_SCOPES.ADMIN,
});

export { HQ_AUTH_SCOPE };

function normalizeAdminPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 9) return `+998${digits}`;
  return digits.startsWith("998") ? `+${digits}` : `+${digits}`;
}

export async function adminLogin(phone, password) {
  await waitForAuthLogout({ scope: AUTH_SCOPES.ADMIN });
  const normalizedPhone = normalizeAdminPhone(phone);
  const { data } = await adminApi.post("/auth/admin/login", { phone: normalizedPhone, password });
  const tokens = normalizeTokenResponse(data);
  saveAuthTokens(tokens, { scope: AUTH_SCOPES.ADMIN });
  return tokens;
}

export async function getValidatedAdminProfile() {
  try {
    const { data } = await adminApi.get("/auth/me");
    if (!isValidatedHqProfile(data)) {
      const error = new Error("HQ admin session required");
      error.code = "HQ_ADMIN_SESSION_REQUIRED";
      throw error;
    }
    return data;
  } catch (error) {
    endAuthSession("admin_validation_failed", { scope: AUTH_SCOPES.ADMIN });
    throw error;
  }
}

export async function adminLogout() {
  return logoutAuthSession({
    scope: AUTH_SCOPES.ADMIN,
    revoke: (refreshToken, accessToken) => adminApi.post(
      "/auth/logout",
      { refresh_token: refreshToken },
      accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
    ),
  });
}

export function isAdminAuthenticated() {
  return Boolean(getAccessToken({ scope: AUTH_SCOPES.ADMIN }));
}
