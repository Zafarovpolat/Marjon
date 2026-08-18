import { describe, expect, it } from "vitest";
import {
  canAccessPath,
  canAccessSection,
  canPerform,
  filterNavItems,
  getRole,
  getRoleHomePath,
  isOwnerWebUser,
} from "./permissions";

const companyId = "company-1";
const appUser = (role) => ({
  auth_scope: "app",
  company_id: companyId,
  is_superadmin: false,
  role_slugs: role ? [role] : [],
});

const users = {
  owner: appUser("owner"),
  superadmin: { auth_scope: "hq_admin", company_id: null, is_superadmin: true, role_slugs: [] },
  admin: appUser("admin"),
  manager: appUser("manager"),
  cashier: appUser("cashier"),
  waiter: appUser("waiter"),
  kitchen: appUser("kitchen"),
  monoblock: appUser("monoblock"),
  courier: appUser("courier"),
  warehouse: appUser("warehouse"),
  unknown: appUser("auditor"),
  noRole: appUser(null),
};

const nonWebActors = [
  users.superadmin,
  users.admin,
  users.manager,
  users.cashier,
  users.waiter,
  users.kitchen,
  users.monoblock,
  users.courier,
  users.warehouse,
  users.unknown,
  users.noRole,
];

describe("Web Launch V1 permissions", () => {
  it("recognizes role labels without turning operational roles into Web clients", () => {
    expect(getRole(users.owner)).toBe("owner");
    expect(getRole(users.superadmin)).toBe("superadmin");
    expect(getRole(users.manager)).toBe("manager");
    expect(getRole(users.warehouse)).toBe("warehouse");
  });

  it("accepts only an exact canonical OWNER identity for the APP shell", () => {
    expect(isOwnerWebUser(users.owner)).toBe(true);
    expect(isOwnerWebUser({ ...users.owner, auth_scope: "hq_admin" })).toBe(false);
    expect(isOwnerWebUser({ ...users.owner, company_id: null })).toBe(false);
    expect(isOwnerWebUser({ ...users.owner, is_superadmin: true })).toBe(false);
    expect(isOwnerWebUser({ ...users.owner, role_slugs: ["owner", "cashier"] })).toBe(false);
    nonWebActors.forEach((user) => expect(isOwnerWebUser(user)).toBe(false));
  });

  it.each([
    ["wrong session scope", { ...users.owner, auth_scope: "hq_admin" }],
    ["missing company", { ...users.owner, company_id: null }],
    ["SUPER_ADMIN flag", { ...users.owner, is_superadmin: true }],
    ["ambiguous OWNER roles", { ...users.owner, role_slugs: ["owner", "cashier"] }],
    ["system-like OWNER role", { ...users.owner, role_slugs: ["owner"], system_role: true, is_superadmin: true }],
  ])("fails closed for %s", (_, user) => {
    expect(isOwnerWebUser(user)).toBe(false);
    expect(getRoleHomePath(user)).toBe("/login");
  });

  it("keeps OWNER Web navigation and direct APP routes available", () => {
    expect(canAccessSection(users.owner, "finance")).toBe(true);
    expect(canAccessPath(users.owner, "/")).toBe(true);
    expect(canAccessPath(users.owner, "/orders")).toBe(true);
    expect(canAccessPath(users.owner, "/users/cashier")).toBe(true);
  });

  it.each([
    "/",
    "/orders",
    "/store",
    "/finance/transactions",
    "/users",
    "/staff",
    "/reports",
    "/analytics",
    "/stock-report/incoming",
    "/warehouse/stock",
    "/settings/profile",
    "/settings/support",
    "/nomenclature/dishes",
    "/menu",
    "/reviews",
  ])("keeps the OWNER route family %s available", (pathname) => {
    expect(canAccessPath(users.owner, pathname)).toBe(true);
  });

  it("does not give SUPER_ADMIN or operational roles an APP wildcard", () => {
    nonWebActors.forEach((user) => {
      expect(canAccessSection(user, "dashboard")).toBe(false);
      expect(canAccessPath(user, "/")).toBe(false);
      expect(canAccessPath(user, "/orders")).toBe(false);
      expect(canAccessPath(user, "/settings/profile")).toBe(false);
    });
  });

  it.each([
    ["legacy admin", users.admin],
    ["manager", users.manager],
    ["cashier", users.cashier],
    ["waiter", users.waiter],
    ["kitchen", users.kitchen],
    ["monoblock", users.monoblock],
    ["courier", users.courier],
    ["warehouse", users.warehouse],
  ])("denies direct OWNER route access to %s", (_, user) => {
    expect(canAccessPath(user, "/")).toBe(false);
    expect(canAccessPath(user, "/finance/transactions")).toBe(false);
    expect(canAccessPath(user, "/users")).toBe(false);
  });

  it.each(["/waiter", "/waiter/orders", "/kitchen", "/login/staff"])(
    "does not classify the removed Web client path %s as an OWNER APP section",
    (pathname) => {
      expect(canAccessPath(users.owner, pathname)).toBe(false);
    },
  );

  it("uses only OWNER as a Web landing and fails every other role closed", () => {
    expect(getRoleHomePath(users.owner)).toBe("/");
    nonWebActors.forEach((user) => expect(getRoleHomePath(user)).toBe("/login"));
  });

  it("filters the OWNER menu without removing staff-management labels", () => {
    const items = [{ key: "dashboard" }, { key: "users" }];
    expect(filterNavItems(items, users.owner)).toEqual(items);
    nonWebActors.forEach((user) => expect(filterNavItems(items, user)).toEqual([]));
    expect(filterNavItems(items, null)).toEqual([]);
  });

  it("does not infer Web write authority for operational roles or SUPER_ADMIN", () => {
    expect(canPerform(users.owner, "employees.write")).toBe(true);
    expect(canPerform(users.owner, "warehouse.write")).toBe(false);
    expect(canPerform(users.owner, "unknown.write")).toBe(false);
    nonWebActors.forEach((user) => {
      expect(canPerform(user, "employees.write")).toBe(false);
      expect(canPerform(user, "finance.write")).toBe(false);
    });
  });
});
