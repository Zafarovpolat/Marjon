import axios from "axios";

export const AUTH_STORAGE_KEYS = {
  accessToken: "access_token",
  refreshToken: "refresh_token",
  adminAccessToken: "admin_access_token",
  adminRefreshToken: "admin_refresh_token",
};

export const AUTH_SESSION_ENDED_EVENT = "marjon:auth-session-ended";

const AUTH_REFRESH_PATH = "/auth/refresh";
const AUTH_REFRESH_EXCLUDED_PATHS = ["/auth/login", "/auth/pin-login", AUTH_REFRESH_PATH];

let refreshPromise = null;
let sessionEndEmitted = false;

function storage() {
  return typeof window !== "undefined" ? window.localStorage : null;
}

function readStorageKey(key) {
  try {
    return storage()?.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStorageKey(key, value) {
  if (!value) return;
  try {
    storage()?.setItem(key, value);
  } catch {
    // Ignore storage failures so auth flow can still reject predictably.
  }
}

function removeStorageKey(key) {
  try {
    storage()?.removeItem(key);
  } catch {
    // Ignore storage failures during logout/session cleanup.
  }
}

function tokenKeysForScope(scope) {
  if (scope === "admin") {
    return {
      accessToken: AUTH_STORAGE_KEYS.adminAccessToken,
      refreshToken: AUTH_STORAGE_KEYS.adminRefreshToken,
    };
  }
  return {
    accessToken: AUTH_STORAGE_KEYS.accessToken,
    refreshToken: AUTH_STORAGE_KEYS.refreshToken,
  };
}

function getPathname(url) {
  try {
    return new URL(String(url || ""), "http://marjon.local").pathname;
  } catch {
    return String(url || "");
  }
}

function joinUrl(baseURL, path) {
  return `${String(baseURL || "").replace(/\/+$/, "")}${path}`;
}

function getRequestUrl(config) {
  return config?.url || "";
}

function getRequestBaseURL(config, fallbackBaseURL) {
  return config?.baseURL || fallbackBaseURL || "";
}

function getRefreshTokenRecord(preferAdminToken = false) {
  const primaryRefresh = readStorageKey(AUTH_STORAGE_KEYS.refreshToken);
  const adminRefresh = readStorageKey(AUTH_STORAGE_KEYS.adminRefreshToken);

  if (preferAdminToken && adminRefresh) {
    return { token: adminRefresh, scope: "admin" };
  }
  if (primaryRefresh) {
    return { token: primaryRefresh, scope: "primary" };
  }
  if (preferAdminToken && adminRefresh) {
    return { token: adminRefresh, scope: "admin" };
  }
  return { token: "", scope: "primary" };
}

function isValidTokenResponse(data) {
  return Boolean(data?.access_token && data?.refresh_token);
}

function setAuthorizationHeader(config, token) {
  config.headers = config.headers || {};
  config.headers.Authorization = `Bearer ${token}`;
}

export function getAccessToken({ preferAdminToken = false } = {}) {
  const primaryAccess = readStorageKey(AUTH_STORAGE_KEYS.accessToken);
  const adminAccess = readStorageKey(AUTH_STORAGE_KEYS.adminAccessToken);

  if (preferAdminToken) return adminAccess || primaryAccess;
  return primaryAccess;
}

export function getRefreshToken({ preferAdminToken = false } = {}) {
  return getRefreshTokenRecord(preferAdminToken).token;
}

export function hasAccessToken({ preferAdminToken = false } = {}) {
  return Boolean(getAccessToken({ preferAdminToken }));
}

export function saveAuthTokens(data, { scope = "primary" } = {}) {
  if (!data?.access_token) return false;

  const keys = tokenKeysForScope(scope);
  writeStorageKey(keys.accessToken, data.access_token);
  if (data.refresh_token) {
    writeStorageKey(keys.refreshToken, data.refresh_token);
  }
  sessionEndEmitted = false;
  return true;
}

export function clearAuthTokens({ scope = "all" } = {}) {
  if (scope === "primary" || scope === "all") {
    removeStorageKey(AUTH_STORAGE_KEYS.accessToken);
    removeStorageKey(AUTH_STORAGE_KEYS.refreshToken);
  }
  if (scope === "admin" || scope === "all") {
    removeStorageKey(AUTH_STORAGE_KEYS.adminAccessToken);
    removeStorageKey(AUTH_STORAGE_KEYS.adminRefreshToken);
  }
}

export function subscribeToAuthSessionEnded(listener) {
  if (typeof listener !== "function") return () => {};
  function onWindowEvent(event) {
    listener(event.detail || {});
  }
  window.addEventListener(AUTH_SESSION_ENDED_EVENT, onWindowEvent);
  return () => window.removeEventListener(AUTH_SESSION_ENDED_EVENT, onWindowEvent);
}

export function endAuthSession(reason = "session_expired") {
  clearAuthTokens();
  if (sessionEndEmitted) return;
  sessionEndEmitted = true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_SESSION_ENDED_EVENT, { detail: { reason } }));
  }
}

export function shouldSkipAuthRefresh(url) {
  const pathname = getPathname(url);
  return AUTH_REFRESH_EXCLUDED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function refreshAuthSession({ baseURL, preferAdminToken = false } = {}) {
  if (refreshPromise) return refreshPromise;

  const refreshRecord = getRefreshTokenRecord(preferAdminToken);
  if (!refreshRecord.token) {
    endAuthSession("missing_refresh_token");
    return Promise.reject(new Error("missing_refresh_token"));
  }

  refreshPromise = axios.post(joinUrl(baseURL, AUTH_REFRESH_PATH), {
    refresh_token: refreshRecord.token,
  }, {
    headers: { "Content-Type": "application/json" },
  })
    .then(({ data }) => {
      if (!isValidTokenResponse(data)) {
        throw new Error("invalid_refresh_response");
      }
      saveAuthTokens(data, { scope: refreshRecord.scope });
      return data.access_token;
    })
    .catch((error) => {
      endAuthSession("refresh_failed");
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export async function handleAuthResponseError(error, { client, baseURL, preferAdminToken = false } = {}) {
  const originalRequest = error?.config;
  const status = error?.response?.status;
  const requestUrl = getRequestUrl(originalRequest);

  if (status !== 401 || !originalRequest || shouldSkipAuthRefresh(requestUrl)) {
    return Promise.reject(error);
  }

  if (originalRequest._authRetry) {
    endAuthSession("retry_unauthorized");
    return Promise.reject(error);
  }

  originalRequest._authRetry = true;

  try {
    const newAccessToken = await refreshAuthSession({
      baseURL: getRequestBaseURL(originalRequest, baseURL),
      preferAdminToken,
    });
    setAuthorizationHeader(originalRequest, newAccessToken);
    return client(originalRequest);
  } catch (refreshError) {
    return Promise.reject(refreshError);
  }
}

export function getAuthRefreshPromiseForTest() {
  return refreshPromise;
}

export function resetAuthSessionStateForTest() {
  refreshPromise = null;
  sessionEndEmitted = false;
}
