import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OwnerDashboard from "../OwnerDashboard";
import { dashboardService } from "../../api/dashboard";
import { buildDashboardPreviewKpis } from "./dashboardPreviewData";

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../../api/dashboard", () => ({ dashboardService: { loadOwnerOverview: vi.fn() } }));
vi.mock("../../components/Icon", () => ({ default: () => <span aria-hidden="true" /> }));
vi.mock("../../components/Loader", () => ({ PageLoader: () => <div>loading</div> }));
vi.mock("./RevenueChart", () => ({
  default: ({ sales }) => <div data-testid="normal-chart">{JSON.stringify(sales)}</div>,
}));
vi.mock("./DashboardCards", () => ({
  EmptyState: ({ title }) => <div>{title}</div>,
  TopSalesCard: ({ dishes }) => <div data-testid="normal-top">{JSON.stringify(dishes)}</div>,
  RecentOrdersCard: ({ orders }) => <div data-testid="normal-orders">{JSON.stringify(orders)}</div>,
}));

// KPI dialog tables share ONE Recipes-family skin (V1): shell + header +
// separators + hover mirror the approved Recipes table; columns, progress
// bars, labels and preview data stay untouched.
describe("Dashboard KPI dialog tables share the Recipes skin", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("DEV", true);
    window.history.replaceState({}, "", "/?previewData=1");
    vi.clearAllMocks();
    dashboardService.loadOwnerOverview.mockResolvedValue(Array.from({ length: 8 }, () => ({ data: [] })));
  });

  it.each(buildDashboardPreviewKpis().map((kpi) => [kpi.label]))(
    "renders %s table inside the shared skin with intact data",
    async (label) => {
      render(<OwnerDashboard />);
      fireEvent.click(await screen.findByRole("button", { name: new RegExp(label) }));
      const dialog = screen.getByRole("dialog", { name: label });
      const table = within(dialog).getByRole("table");
      // Shared skin scope: dialog carries the modifier, table keeps its classes.
      expect(dialog.className).toMatch("kpi-info-window--payment-table");
      expect(table.className).toMatch("kpi-payment-report__table");
      // Data contract intact: 3 columns, progress share bars present.
      expect(within(table).getAllByRole("columnheader")).toHaveLength(3);
      expect(table.querySelector(".kpi-payment-report__share")).not.toBeNull();
      fireEvent.click(within(dialog).getByRole("button", { name: "Закрыть" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    },
  );

  it("defines the shared skin once with Recipes tokens and no !important", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dashboard.css`, "utf8");
    const scope = ".kpi-info-window--payment-table";
    expect(css).toContain(scope);
    const shell = css.match(/\.kpi-info-window--payment-table \.kpi-payment-report\s*\{[^}]*\}/)?.[0] || "";
    expect(shell).toMatch(/border:\s*1px solid #D0D9E8/i);
    expect(shell).toMatch(/border-radius:\s*20px/);
    const head = css.match(
      /\.kpi-info-window--payment-table \.kpi-payment-report__table th\s*\{[^}]*\}/,
    )?.[0] || "";
    expect(head).toMatch(/background:\s*#EFF6FF/i);
    expect(head).toMatch(/color:\s*#536D8E/i);
    expect(head).toMatch(/font-size:\s*12px/);
    expect(head).toMatch(/font-weight:\s*500/);
    const cells = css.match(
      /\.kpi-info-window--payment-table \.kpi-payment-report__table td\s*\{[^}]*\}/,
    )?.[0] || "";
    expect(cells).toMatch(/border-bottom:\s*1px solid #D0D9E8/i);
    const hover = css.match(
      /\.kpi-info-window--payment-table \.kpi-payment-report__table tbody tr:hover\s*\{[^}]*\}/,
    )?.[0] || "";
    expect(hover).toMatch(/background:\s*#F4F7FC/i);
    expect(hover).not.toMatch(/transform|scale|box-shadow/);
    // No !important inside the new shared skin declarations themselves.
    const skinStart = css.indexOf("Dashboard KPI dialog tables — ONE shared skin");
    expect(skinStart).toBeGreaterThan(-1);
    const skinBodies = [...css.slice(skinStart, skinStart + 2200).matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);
    expect(skinBodies.length).toBeGreaterThan(0);
    expect(skinBodies.every((body) => !body.includes("!important"))).toBe(true);
    // Single shared block: exactly the 5 table rules, no per-dialog duplication.
    const tableRules = css.match(/\.kpi-info-window--payment-table \.kpi-payment-report[^{]*\{/g) || [];
    expect(tableRules).toHaveLength(5);
  });
});
