import { describe, expect, it } from "vitest";
import { canAccessSection, filterNavItems, getRole } from "./permissions";

describe("permissions", () => {
  it("allows owner and super admin to access all sections", () => {
    const owner = { role_slugs: ["owner"] };
    const admin = { is_superadmin: true, role_slugs: [] };

    expect(getRole(owner)).toBe("owner");
    expect(getRole(admin)).toBe("superadmin");
    expect(canAccessSection(owner, "finance")).toBe(true);
    expect(canAccessSection(admin, "unknown-section")).toBe(true);
  });

  it("keeps cashier access limited to cashier sections", () => {
    const cashier = { role_slugs: ["cashier"] };

    expect(getRole(cashier)).toBe("cashier");
    expect(canAccessSection(cashier, "orders")).toBe(true);
    expect(canAccessSection(cashier, "settings.profile")).toBe(true);
    expect(canAccessSection(cashier, "finance")).toBe(false);
  });

  it("filters navigation safely when user data is missing", () => {
    expect(filterNavItems([{ key: "orders" }], null)).toEqual([]);
  });
});
