// Сессия филиала: вход «как филиал» и переключение владельца в филиал.
// Токен владельца прячем отдельно, чтобы вернуться к сети без повторного входа.
// Переключение = подмена DEFAULT-токена сессии + перезагрузка приложения, чтобы
// AuthContext/OrgContext перечитали /auth/me уже под филиалом.
import { api } from "../api/client";
import { AUTH_SCOPES, getAccessToken, getRefreshToken, saveAuthTokens } from "./session";

const OWNER_STASH_KEY = "marjon_owner_session";
const ACTIVE_BRANCH_KEY = "marjon_active_branch";

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

export function getActiveBranch() {
  return readJson(ACTIVE_BRANCH_KEY);
}

function applyBranchTokens(data, { canReturn }) {
  saveAuthTokens(
    { access_token: data.access_token, refresh_token: data.refresh_token },
    { scope: AUTH_SCOPES.DEFAULT },
  );
  try {
    localStorage.setItem(
      ACTIVE_BRANCH_KEY,
      JSON.stringify({ id: data.branch?.id, name: data.branch?.name, canReturn }),
    );
  } catch {
    /* ignore storage failures */
  }
}

// Владелец (уже в сети) → переключение в филиал по клику, без пароля.
export async function enterBranchFromOwner(branchId) {
  const access = getAccessToken({ scope: AUTH_SCOPES.DEFAULT });
  const refresh = getRefreshToken({ scope: AUTH_SCOPES.DEFAULT });
  if (access) {
    try {
      localStorage.setItem(OWNER_STASH_KEY, JSON.stringify({ access, refresh }));
    } catch {
      /* ignore */
    }
  }
  const { data } = await api.post("/auth/branch-switch", { branch_id: branchId });
  applyBranchTokens(data, { canReturn: true });
  window.location.assign("/");
}

// Начальный экран: прямой вход в филиал по его логину/паролю (без владельца).
export async function loginAsBranch(login, password) {
  const { data } = await api.post("/auth/branch-login", { login, password });
  try {
    localStorage.removeItem(OWNER_STASH_KEY);
  } catch {
    /* ignore */
  }
  applyBranchTokens(data, { canReturn: false });
  window.location.assign("/");
}

// Вернуться к сети (владельцу) — восстановить его сохранённый токен.
export function returnToNetwork() {
  const stash = readJson(OWNER_STASH_KEY);
  if (stash?.access) {
    saveAuthTokens(
      { access_token: stash.access, refresh_token: stash.refresh },
      { scope: AUTH_SCOPES.DEFAULT },
    );
  }
  clearBranchSession();
  window.location.assign("/");
}

export function clearBranchSession() {
  try {
    localStorage.removeItem(OWNER_STASH_KEY);
    localStorage.removeItem(ACTIVE_BRANCH_KEY);
  } catch {
    /* ignore */
  }
}
