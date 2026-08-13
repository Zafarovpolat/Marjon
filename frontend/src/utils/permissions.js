// Правила доступа по ролям для фильтрации навигации и страниц.
// Соответствует ТЗ §2.2 (Ролевая фильтрация Sidebar).

export const ROLES = {
  OWNER: "owner",
  SUPERADMIN: "superadmin",
  ADMIN: "admin",
  MANAGER: "manager",
  CASHIER: "cashier",
  WAITER: "waiter",
  KITCHEN: "kitchen",
  MONOBLOCK: "monoblock",
};

// Web Launch V1 exposes the APP shell only to the canonical OWNER identity.
// Operational roles remain valid staff-management values, but are not Web clients.
const ROLE_SECTIONS = {
  owner: "*",
};

const OWNER_UI_ACTIONS = new Set([
  "employees.write",
  "orders.write",
  "finance.write",
  "settings.write",
]);

// Стартовая страница по роли (для редиректа после логина).
export const ROLE_HOME = {
  owner: "/",
};

const ROUTE_SECTION_RULES = [
  { exact: "/", sectionKey: "dashboard" },
  { prefixes: ["/finance"], sectionKey: "finance" },
  { prefixes: ["/users", "/staff"], sectionKey: "users" },
  { prefixes: ["/reports", "/analytics"], sectionKey: "reports" },
  { prefixes: ["/stock-report"], sectionKey: "warehouse-report" },
  { prefixes: ["/warehouse"], sectionKey: "warehouse" },
  { prefixes: ["/settings/profile"], sectionKey: "settings.profile" },
  { prefixes: ["/settings/support"], sectionKey: "settings.support" },
  { prefixes: ["/settings"], sectionKey: "settings" },
  {
    prefixes: [
      "/nomenclature/raw-materials",
      "/nomenclature/raw-categories",
      "/nomenclature/semi-finished",
      "/nomenclature/semi-finished-categories",
    ],
    sectionKey: "warehouse",
  },
  { prefixes: ["/nomenclature", "/menu"], sectionKey: "nomenclature" },
  { prefixes: ["/orders", "/store"], sectionKey: "orders" },
  { prefixes: ["/reviews"], sectionKey: "reviews" },
];

function normalizePathname(pathname) {
  const path = String(pathname || "/").split("?")[0].split("#")[0] || "/";
  return path !== "/" && path.endsWith("/") ? path.slice(0, -1) : path;
}

function startsWithPath(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getRole(user) {
  if (!user) return null;
  if (user.is_superadmin) return ROLES.SUPERADMIN;
  const roles = user.role_slugs || [];
  if (roles.includes(ROLES.OWNER)) return ROLES.OWNER;
  if (roles.includes(ROLES.ADMIN)) return ROLES.ADMIN;
  if (roles.includes(ROLES.MANAGER)) return ROLES.MANAGER;
  if (roles.includes(ROLES.CASHIER)) return ROLES.CASHIER;
  if (roles.includes(ROLES.WAITER)) return ROLES.WAITER;
  if (roles.includes(ROLES.KITCHEN)) return ROLES.KITCHEN;
  if (roles.includes(ROLES.MONOBLOCK)) return ROLES.MONOBLOCK;
  return roles[0] || null;
}

export function isOwnerWebUser(user) {
  const roles = Array.isArray(user?.role_slugs) ? user.role_slugs : [];
  return Boolean(
    user
      && user.auth_scope === "app"
      && user.company_id
      && user.is_superadmin !== true
      && roles.length === 1
      && roles[0] === ROLES.OWNER,
  );
}

export function canAccessSection(user, sectionKey) {
  return isOwnerWebUser(user) && ROLE_SECTIONS.owner === "*" && Boolean(sectionKey);
}

// Route guard helpers.
export function getSectionForPath(pathname) {
  const path = normalizePathname(pathname);
  const rule = ROUTE_SECTION_RULES.find((item) => {
    if (item.exact) return path === item.exact;
    return item.prefixes?.some((prefix) => startsWithPath(path, prefix));
  });
  return rule?.sectionKey || null;
}

export function canAccessPath(user, pathname) {
  const sectionKey = getSectionForPath(pathname);
  return sectionKey ? canAccessSection(user, sectionKey) : false;
}

export function getRoleHomePath(user) {
  return isOwnerWebUser(user) ? ROLE_HOME.owner : "/login";
}

// Применить ролевой фильтр к массиву пунктов меню Sidebar.
export function filterNavItems(navItems, user) {
  return isOwnerWebUser(user) ? navItems : [];
}

// Универсальная проверка действий (PATCH/DELETE).
export function canPerform(user, action) {
  return isOwnerWebUser(user) && OWNER_UI_ACTIONS.has(action);
}
