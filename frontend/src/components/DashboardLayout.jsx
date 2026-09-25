import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import SupportWidget from "./SupportWidget";
import Topbar from "./Topbar";
import { pageMeta } from "./pageMeta";
import { clampToToday, todayInputValue } from "../utils/date";
import { useAuth } from "../hooks/useAuth";

const TABLE_REPORT_PATHS = new Set([
  "/reports/orders",
  "/reports/tables",
  "/reports/waiters",
  "/reports/dishes",
  "/reports/cancelled-dishes",
]);

// Страницы «Сырьё» и «Полуфабрикаты» используют шаблон раздела «Сотрудники»
// (.staff-page/.staff-card), поэтому им нужна та же раскладка контента, что и
// у /users: без двойного отступа (.staff-page padding:0 + узкий padding у
// content). Без этого .staff-page сохраняет дефолтные 26px и карточка уезжает.
const STAFF_LAYOUT_PATHS = new Set([
  "/nomenclature/raw-materials",
  "/nomenclature/semi-finished",
]);

export default function DashboardLayout() {
  const location = useLocation();
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => todayInputValue());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [title, subtitle] = useMemo(() => pageMeta[location.pathname] || ["Dashboard", ""], [location.pathname]);
  const isUsersSection = location.pathname.startsWith("/users");
  const isStaffLayout = isUsersSection || STAFF_LAYOUT_PATHS.has(location.pathname);
  const isTableReport = TABLE_REPORT_PATHS.has(location.pathname);
  const selectedDateContext = useMemo(() => ({
    user,
    selectedDate,
    setSelectedDate: (value) => setSelectedDate(clampToToday(value)),
  }), [user, selectedDate]);

  // OWNER shell scope must exist BEFORE first paint: the approved light shell
  // rules are scoped under body.dashboard-body, while legacy layered rules
  // paint the shell dark. useLayoutEffect flushes synchronously after DOM
  // mutations and before the browser paints, so frame #1 is already correct.
  // (useEffect would run after first paint => one dark flash frame.)
  useLayoutEffect(() => {
    document.body.classList.add("dashboard-body");
    return () => document.body.classList.remove("dashboard-body");
  }, []);

  return (
    <div>
      <div className={`dashboard-shell ${sidebarCollapsed ? "is-sidebar-collapsed" : "is-sidebar-expanded"}`}>
        <Sidebar user={user} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} />
        <div className={`dashboard-main ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}`}>
          <Topbar
            title={title}
            subtitle={subtitle}
            selectedDate={selectedDate}
            onSelectedDateChange={setSelectedDate}
          />
          <main className={`dashboard-content${isStaffLayout ? " dashboard-content--staff" : ""}${isTableReport ? " dashboard-content--table-report" : ""}`}>
            <Outlet context={selectedDateContext} />
          </main>
          <SupportWidget />
        </div>
      </div>
    </div>
  );
}


