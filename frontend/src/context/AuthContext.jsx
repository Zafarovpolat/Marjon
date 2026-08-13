// Глобальный контекст авторизации.
// Содержит текущего user, роль, методы login/logout, статус загрузки.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isAuthenticated, login as apiLogin, loginByPhone as apiLoginByPhone, loginByPin as apiLoginByPin, logout as apiLogout } from "../api/client";
import { authService } from "../api/auth";
import { AUTH_SCOPES, subscribeToAuthSessionEnded } from "../auth/session";
import { getRole, getRoleHomePath } from "../utils/permissions";
import { isAbortError, useLatestRequest } from "../hooks/useAsyncSafety";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const beginProfileRequest = useLatestRequest();

  const loadProfile = useCallback(async () => {
    const request = beginProfileRequest();
    if (!isAuthenticated()) {
      setUser(null);
      setSessionExpired(false);
      setLoading(false);
      return null;
    }
    try {
      const { data } = await authService.getCurrentUser({ signal: request.signal });
      if (!request.isCurrent()) return null;
      setUser(data);
      setSessionExpired(false);
      return data;
    } catch (e) {
      if (!request.isCurrent() || isAbortError(e)) return null;
      setUser(null);
      if (e?.response?.status === 401) setSessionExpired(true);
      return null;
    } finally {
      if (request.isCurrent()) setLoading(false);
    }
  }, [beginProfileRequest]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => subscribeToAuthSessionEnded(({ reason, scope }) => {
    if (scope === AUTH_SCOPES.ADMIN) return;
    beginProfileRequest();
    setUser(null);
    setLoading(false);
    setSessionExpired(reason !== "logout");
  }), [beginProfileRequest]);

  const loginEmail = useCallback(async (email, password) => {
    setError(null);
    try {
      await apiLogin(email, password);
      setSessionExpired(false);
      return await loadProfile();
    } catch (e) {
      setError(e?.response?.data?.detail || "Ошибка входа");
      throw e;
    }
  }, [loadProfile]);

  const loginPhone = useCallback(async (phone, password) => {
    setError(null);
    try {
      await apiLoginByPhone(phone, password);
      setSessionExpired(false);
      return await loadProfile();
    } catch (e) {
      setError(e?.response?.data?.detail || "Ошибка входа");
      throw e;
    }
  }, [loadProfile]);

  const loginPin = useCallback(async (employeeId, pin) => {
    setError(null);
    try {
      await apiLoginByPin(employeeId, pin);
      setSessionExpired(false);
      return await loadProfile();
    } catch (e) {
      setError(e?.response?.data?.detail || "Неверный PIN");
      throw e;
    }
  }, [loadProfile]);

  const logout = useCallback(() => {
    const logoutRequest = apiLogout();
    // The UI logs out locally even when server-side revocation is unavailable.
    // Keep returning the original promise so callers and tests can observe the failure.
    logoutRequest.catch(() => {});
    setUser(null);
    setSessionExpired(false);
    return logoutRequest;
  }, []);

  const value = useMemo(() => ({
    user,
    role: getRole(user),
    isAuthenticated: Boolean(user),
    loading,
    sessionExpired,
    error,
    loginEmail,
    loginPhone,
    loginPin,
    logout,
    reload: loadProfile,
    homeFor: (u) => getRoleHomePath(u || user),
  }), [user, loading, sessionExpired, error, loginEmail, loginPhone, loginPin, logout, loadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
