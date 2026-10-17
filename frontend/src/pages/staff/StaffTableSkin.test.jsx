import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StaffTable from "./StaffTable";

vi.mock("../../components/Icon", () => ({ default: () => <span aria-hidden="true" /> }));

const props = {
  staffLoading: false,
  staffError: "",
  visibleStaff: [],
  pendingActionId: "",
  openEditModal: vi.fn(),
  archiveStaff: vi.fn(),
  restoreStaff: vi.fn(),
};

describe("canonical Staff role table visual skin", () => {
  it.each([
    ["waiter", { isWaiter: true }, 8],
    ["cashier", { isCashier: true }, 8],
    ["manager", { isManager: true }, 7],
    ["warehouse", { isWarehouse: true }, 7],
    ["monoblock", { isMonoblock: true }, 8],
    ["all", {}, 8],
    ["courier", {}, 8],
    ["kitchen", {}, 8],
  ])("scopes %s skin and preserves its column contract", (_role, flags, columns) => {
    const { container } = render(<StaffTable {...props} {...flags} />);
    const shell = container.querySelector(".staff-table-wrapper--roles");
    expect(shell.querySelector(":scope > .staff-role-table-scroll > .staff-table")).not.toBeNull();
    expect(shell.querySelectorAll("thead th")).toHaveLength(columns);
    expect(shell.querySelector(".staff-empty-cell").colSpan).toBe(columns);
    expect(shell.querySelector(".staff-role-table-scroll")).toHaveAttribute("role", "region");
    expect(shell.querySelector(".staff-role-table-scroll")).toHaveAttribute("tabindex", "0");
    expect(shell.querySelector(".staff-empty-row [role='status']")).not.toBeNull();
  });

  it("limits the V30 palette and hover to the role wrapper without changing geometry", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/staff-users.css`, "utf8");
    const skin = css.slice(css.indexOf("/* STAFF-TABLE-V1:"), css.indexOf("/* STAFF-TABLE-VIEWPORT-V2:"));
    expect(skin).toContain("border-color: var(--neutral-200, #d0d9e8)");
    expect(skin).toContain("border-top-color: var(--neutral-200, #d0d9e8)");
    expect(skin).toContain("background: var(--blue-50, #eff6ff)");
    expect(skin).toContain("background: var(--neutral-50, #f4f7fc)");
    expect(skin).toContain("border-radius: 20px");
    expect(skin).toContain("overflow-x: auto");
    expect(skin).toContain("tr:not(.staff-empty-row):hover td");
    expect(skin).toContain("transition: none");
    const selectors = [...skin.matchAll(/(?:^|\n)(\.[^{]+)\{/g)].map((match) => match[1].trim());
    expect(selectors.length).toBe(9);
    expect(selectors.every((selector) => selector.includes(".staff-table-wrapper--roles"))).toBe(true);
    expect(skin).not.toMatch(/(?:^|[;\s])(?:width|height|min-width|min-height|padding|font-size|font-weight|transform)\s*:/);
    expect(skin).not.toContain("!important");
  });

  it("covers every routed shared role table, including courier aliases", () => {
    const app = readFileSync(`${process.cwd()}/src/App.jsx`, "utf8");
    const routes = [...app.matchAll(/path:\s*"(users[^"]*)",\s*element:\s*<StaffRolePage role="([^"]+)"/g)];
    expect(routes.map((match) => match[1])).toEqual([
      "users", "users/cashier", "users/waiter", "users/courier", "users/couriers",
      "users/kuryer", "users/delivery", "users/monoblock", "users/kitchen",
      "users/manager", "users/warehouse",
    ]);
    expect(new Set(routes.map((match) => match[2])).size).toBe(8);
  });

  it("bounds the shared viewport, hides scrollbar paint and keeps the sticky header", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/staff-users.css`, "utf8");
    const layout = css.slice(css.indexOf("/* STAFF-TABLE-VIEWPORT-V2:"));
    expect(layout).toMatch(/\.staff-card:has\(\.staff-table-wrapper--roles\)\s*\{[^}]*max-height:\s*100%/);
    expect(layout).toMatch(/\.staff-table-wrapper\.staff-table-wrapper--roles\s*\{[^}]*flex:\s*0 1 auto/);
    expect(layout).toMatch(/\.staff-role-table-scroll\s*\{[^}]*min-height:\s*0/);
    expect(layout).toMatch(/\.staff-role-table-scroll\s*\{[^}]*overflow:\s*auto/);
    expect(layout).toContain("scrollbar-width: none");
    expect(layout).toContain("-ms-overflow-style: none");
    expect(layout).toMatch(/\.staff-role-table-scroll::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
    expect(layout).toMatch(/\.staff-table th\s*\{[^}]*position:\s*sticky/);
    expect(layout).toContain("padding-bottom: 12px");
    expect(layout).not.toContain("!important");
    expect(layout).not.toMatch(/\.staff-table (?:td|tbody tr)\s*\{/);
  });

  it("shrink-wraps few rows without end filler and puts keyboard focus on the rounded wrapper", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/staff-users.css`, "utf8");
    const layout = css.slice(css.indexOf("/* STAFF-TABLE-VIEWPORT-V2:"));
    expect(layout).toMatch(/\.staff-page\s*\{[^}]*flex-direction:\s*column/);
    expect(layout).toMatch(/\.staff-card:has\(\.staff-table-wrapper--roles\)\s*\{[^}]*flex:\s*0 1 auto/);
    expect(layout).toMatch(/\.staff-role-table-scroll\s*\{[^}]*flex:\s*0 1 auto/);
    expect(layout).not.toMatch(/(?:padding-bottom|scroll-padding-bottom):\s*48px/);
    expect(layout).toMatch(/\.staff-table-wrapper--roles:has\(> \.staff-role-table-scroll:focus-visible\)\s*\{[^}]*outline:\s*2px solid/);
    expect(css).toMatch(/\.staff-empty-cell\s*\{[^}]*padding:/);
    expect(css).toMatch(/\.staff-table-wrapper--roles\s*\{[^}]*overflow:\s*hidden/);
  });
});
