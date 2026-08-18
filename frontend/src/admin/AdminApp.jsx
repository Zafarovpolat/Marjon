import { useCallback, useEffect, useRef, useState } from "react";

import { getValidatedAdminProfile, isAdminAuthenticated } from "./api";

import { AUTH_SCOPES, subscribeToAuthSessionEnded } from "../auth/session";

import { AdminShell, LoginView } from "./AdminLayout";

export default function AdminApp() {
  const [sessionState, setSessionState] = useState(() => (
    isAdminAuthenticated() ? "validating" : "logged_out"
  ));
  const [adminUser, setAdminUser] = useState(null);
  const validationAttemptRef = useRef(0);

  const markLoggedOut = useCallback(() => {
    validationAttemptRef.current += 1;
    setAdminUser(null);
    setSessionState("logged_out");
  }, []);

  const validateSession = useCallback(async ({ hideLogin = false } = {}) => {
    const attempt = validationAttemptRef.current + 1;
    validationAttemptRef.current = attempt;
    if (!isAdminAuthenticated()) {
      markLoggedOut();
      return false;
    }

    if (hideLogin) setSessionState("validating");
    try {
      const profile = await getValidatedAdminProfile();
      if (validationAttemptRef.current !== attempt) return false;
      setAdminUser(profile);
      setSessionState("authenticated");
      return true;
    } catch {
      if (validationAttemptRef.current === attempt) markLoggedOut();
      return false;
    }
  }, [markLoggedOut]);

  useEffect(() => {
    if (isAdminAuthenticated()) validateSession({ hideLogin: true });
  }, [validateSession]);

  useEffect(() => subscribeToAuthSessionEnded(({ scope }) => {
    if (scope === AUTH_SCOPES.ADMIN || scope === AUTH_SCOPES.ALL) markLoggedOut();
  }), [markLoggedOut]);

  if (sessionState === "validating") return null;
  return sessionState === "authenticated" ? (
    <AdminShell user={adminUser} onLogout={markLoggedOut} />
  ) : (
    <LoginView onLogin={validateSession} />
  );
}

export { CategoryPage } from "./AdminSectionRouter";

export { OrdersNomenclaturePage } from "./AdminCatalog";

export { ProductNomenclaturePage } from "./AdminCatalog";

export { StorageInventoryPage } from "./AdminStorage";

export { StorageWriteoffPage } from "./AdminStorage";

export { TransactionsTable } from "./AdminDashboard";

export { TruthfulHandbookLocationPage } from "./AdminHandbook";

export { getAdminOrderTotal } from "./AdminCatalog";

export { normalizeAdminOrder } from "./AdminCatalog";

export { normalizeAdminProduct } from "./AdminCatalog";

export { normalizeHqDashboardTransaction } from "./AdminDashboard";
