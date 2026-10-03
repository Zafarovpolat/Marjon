import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OwnerDashboard from "../OwnerDashboard";
import { dashboardService } from "../../api/dashboard";
import { todayInputValue, toDateInputValue } from "../../utils/date";

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("../../api/dashboard", () => ({
  dashboardService: { loadOwnerOverview: vi.fn() },
}));

vi.mock("../../api/client", () => ({
  formatMoney: (value) => `${Number(value || 0)} UZS`,
  formatNumber: (value) => String(Number(value || 0)),
}));

vi.mock("../../components/Icon", () => ({ default: () => <span aria-hidden="true" /> }));
vi.mock("../../components/Loader", () => ({ PageLoader: () => <div>loading</div> }));
vi.mock("./RevenueChart", () => ({ default: () => <div data-testid="revenue-chart" /> }));
vi.mock("./DashboardDialogs", () => ({
  KpiInfoDialog: () => null,
  WarehouseReportDialog: () => null,
}));
vi.mock("./DashboardCards", () => ({
  EmptyState: ({ title }) => <div>{title}</div>,
  TopSalesCard: () => <div data-testid="top-sales" />,
  RecentOrdersCard: () => <div data-testid="recent-orders" />,
  SectionEmpty: ({ title }) => <div>{title}</div>,
}));

const EMPTY_OVERVIEW = [
  { data: {} },
  { data: [] },
  { data: [] },
  { data: [] },
  { data: [] },
  { data: [] },
  { data: [] },
  { data: [] },
];

function isoOffset(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

function reportDate(value) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

async function renderDashboard() {
  dashboardService.loadOwnerOverview.mockResolvedValue(EMPTY_OVERVIEW);
  render(<OwnerDashboard />);
  return screen.findByRole("button", { name: "Период выручки" });
}

describe("OWNER Dashboard global period V2", () => {
  beforeEach(() => {
    dashboardService.loadOwnerOverview.mockReset();
    window.history.replaceState({}, "", "/");
  });

  it("defaults to a numeric Today label, replaces Подробнее, and closes on outside click and Escape", async () => {
    const trigger = await renderDashboard();
    const today = todayInputValue();

    expect(trigger).toHaveTextContent(reportDate(today));
    expect(trigger).not.toHaveTextContent(/Сегодня|Вчера|Эта неделя|Этот месяц|Этот год/);
    expect(screen.queryByText("Подробнее")).not.toBeInTheDocument();
    expect(dashboardService.loadOwnerOverview).toHaveBeenCalledWith(expect.objectContaining({
      dateFrom: today,
      dateTo: today,
    }));

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.mouseDown(screen.getByRole("heading", { name: "Выручка за 1 день" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("applies Yesterday once and sends the same range to the Dashboard orchestrator", async () => {
    const trigger = await renderDashboard();
    const yesterday = isoOffset(todayInputValue(), -1);
    dashboardService.loadOwnerOverview.mockClear();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Вчера" }));
    expect(dashboardService.loadOwnerOverview).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector(".owner-revenue-switcher .report-date-ok"));

    await waitFor(() => expect(dashboardService.loadOwnerOverview).toHaveBeenCalledTimes(1));
    expect(dashboardService.loadOwnerOverview).toHaveBeenCalledWith(expect.objectContaining({
      dateFrom: yesterday,
      dateTo: yesterday,
    }));
    expect(trigger).toHaveTextContent(reportDate(yesterday));
    expect(window.location.search).toBe(`?date_from=${yesterday}&date_to=${yesterday}`);
  });

  it("applies a manual custom range only on OK", async () => {
    const trigger = await renderDashboard();
    dashboardService.loadOwnerOverview.mockClear();

    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText("Начало периода"), { target: { value: "26.09.2026 | 00:00" } });
    fireEvent.change(screen.getByLabelText("Конец периода"), { target: { value: "02.10.2026 | 00:00" } });
    expect(dashboardService.loadOwnerOverview).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector(".owner-revenue-switcher .report-date-ok"));

    await waitFor(() => expect(dashboardService.loadOwnerOverview).toHaveBeenCalledTimes(1));
    expect(dashboardService.loadOwnerOverview).toHaveBeenCalledWith(expect.objectContaining({
      dateFrom: "2026-09-26",
      dateTo: "2026-10-02",
    }));
    expect(trigger).toHaveTextContent("26.09.2026 – 02.10.2026");
    expect(window.location.search).toBe("?date_from=2026-09-26&date_to=2026-10-02");
  });

  it("completes OK close before refetch and reopens cleanly", async () => {
    const trigger = await renderDashboard();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Вчера" }));
    fireEvent.click(document.querySelector(".owner-revenue-switcher .report-date-ok"));

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("loading")).not.toBeInTheDocument();
    const closingMenu = document.querySelector(".owner-revenue-switcher .report-date-menu.is-closing");
    expect(closingMenu).toHaveAttribute("inert");
    fireEvent(closingMenu, new Event("webkitAnimationEnd", { bubbles: true }));
    await waitFor(() => expect(document.querySelector(".owner-revenue-switcher .report-date-menu")).toBeNull());

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector(".owner-revenue-switcher .report-date-menu.is-closing")).toBeNull();
    expect(document.querySelector(".owner-revenue-switcher .report-date-menu")).not.toHaveAttribute("inert");
  });

  it("survives 20 apply/close/reopen cycles without stale closing state", async () => {
    const trigger = await renderDashboard();

    for (let cycle = 0; cycle < 20; cycle += 1) {
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      fireEvent.click(screen.getByRole("button", { name: cycle % 2 ? "Сегодня" : "Вчера" }));
      fireEvent.click(document.querySelector(".owner-revenue-switcher .report-date-ok"));
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      const closingMenu = document.querySelector(".owner-revenue-switcher .report-date-menu.is-closing");
      expect(closingMenu).toHaveAttribute("inert");
      fireEvent(closingMenu, new Event("webkitAnimationEnd", { bubbles: true }));
      await waitFor(() => expect(document.querySelector(".owner-revenue-switcher .report-date-menu")).toBeNull());
    }

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  }, 15_000);

  it("restores a custom URL range before the first Dashboard request", async () => {
    window.history.replaceState({}, "", "/?date_from=2026-09-26&date_to=2026-10-02");
    const trigger = await renderDashboard();

    expect(trigger).toHaveTextContent("26.09.2026 – 02.10.2026");
    expect(dashboardService.loadOwnerOverview).toHaveBeenCalledTimes(1);
    expect(dashboardService.loadOwnerOverview).toHaveBeenCalledWith(expect.objectContaining({
      dateFrom: "2026-09-26",
      dateTo: "2026-10-02",
    }));
  });

  it("restores Yesterday with a numeric trigger and its preset active only inside the picker", async () => {
    const yesterday = isoOffset(todayInputValue(), -1);
    window.history.replaceState({}, "", `/?date_from=${yesterday}&date_to=${yesterday}`);
    const trigger = await renderDashboard();

    expect(trigger).toHaveTextContent(reportDate(yesterday));
    expect(trigger).not.toHaveTextContent("Вчера");
    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Вчера" })).toHaveClass("is-active");
  });

  it.each([
    "?date_from=bad&date_to=2026-10-02",
    "?date_from=2026-02-30&date_to=2026-03-01",
    "?date_from=2026-10-02",
    "?date_from=2026-10-03&date_to=2026-10-02",
  ])("falls back safely to Today for invalid URL params: %s", async (search) => {
    window.history.replaceState({}, "", `/${search}`);
    const trigger = await renderDashboard();
    const today = todayInputValue();

    expect(trigger).toHaveTextContent(reportDate(today));
    expect(dashboardService.loadOwnerOverview).toHaveBeenCalledTimes(1);
    expect(dashboardService.loadOwnerOverview).toHaveBeenCalledWith(expect.objectContaining({
      dateFrom: today,
      dateTo: today,
    }));
  });

  it("scopes the required 25px radius and 14px/500 typography to the Dashboard trigger without !important", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dashboard.css`, "utf8");
    const rule = css.match(/\.owner-dashboard-period__trigger\s*\{[^}]*\}/s)?.[0] || "";
    expect(rule).toMatch(/border-radius:\s*25px;/);
    expect(rule).toMatch(/font-size:\s*14px;/);
    expect(rule).toMatch(/font-weight:\s*500;/);
    expect(rule).not.toContain("!important");
  });

  it("keeps inside pointer activity open and completes 20 outside and 20 Escape cycles", async () => {
    const trigger = await renderDashboard();
    const outside = screen.getByRole("heading", { name: "Выручка за 1 день" });

    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByRole("button", { name: "Сегодня" }));
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.mouseDown(outside);
    fireEvent(
      document.querySelector(".owner-revenue-switcher .report-date-menu.is-closing"),
      new Event("webkitAnimationEnd", { bubbles: true }),
    );
    await waitFor(() => expect(document.querySelector(".owner-revenue-switcher .report-date-menu")).toBeNull());

    for (let cycle = 0; cycle < 20; cycle += 1) {
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      fireEvent.mouseDown(outside);
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      const closingMenu = document.querySelector(".owner-revenue-switcher .report-date-menu.is-closing");
      expect(closingMenu).toHaveAttribute("inert");
      fireEvent(closingMenu, new Event("webkitAnimationEnd", { bubbles: true }));
      await waitFor(() => expect(document.querySelector(".owner-revenue-switcher .report-date-menu")).toBeNull());
    }

    for (let cycle = 0; cycle < 20; cycle += 1) {
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      fireEvent.keyDown(document, { key: "Escape" });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      fireEvent(
        document.querySelector(".owner-revenue-switcher .report-date-menu.is-closing"),
        new Event("webkitAnimationEnd", { bubbles: true }),
      );
      await waitFor(() => expect(document.querySelector(".owner-revenue-switcher .report-date-menu")).toBeNull());
    }
  });

  it("uses the Orders canonical open/exit contract without a Dashboard collision or popup CSS fork", () => {
    const dashboardSource = readFileSync(`${process.cwd()}/src/pages/OwnerDashboard.jsx`, "utf8");
    const ordersSource = readFileSync(`${process.cwd()}/src/pages/OrdersReportPage.jsx`, "utf8");
    const pickerSource = readFileSync(`${process.cwd()}/src/components/ReportDateRangePicker.jsx`, "utf8");
    const dashboardCss = readFileSync(`${process.cwd()}/src/styles/owner/dashboard.css`, "utf8");
    const reportsCss = readFileSync(`${process.cwd()}/src/styles/owner/reports.css`, "utf8");
    const dashboardPicker = dashboardSource.match(/<ReportDateRangePicker[\s\S]*?\/>/)?.[0] || "";
    const ordersPicker = ordersSource.match(/<ReportDateRangePicker[\s\S]*?\/>/)?.[0] || "";

    [dashboardPicker, ordersPicker].forEach((usage) => {
      expect(usage).toContain('variant="canonical"');
      expect(usage).toContain("animateExit");
      expect(usage).toMatch(/open=\{/);
      expect(usage).toContain("onOpenChange=");
      expect(usage).toContain("onExitComplete=");
    });

    expect(dashboardPicker).not.toContain("collisionAwarePlacement");
    expect(dashboardSource).toContain('className="owner-revenue-switcher"');
    expect(dashboardSource).not.toContain('className="period-switcher owner-revenue-switcher"');
    expect(pickerSource).not.toContain("collisionAwarePlacement");
    expect(pickerSource).toContain('report-period-picker--animated');
    expect(reportsCss).toContain('.report-period-picker--animated > .report-date-menu.is-closing');
    expect(reportsCss).not.toContain(".report-date-menu.is-above");
    expect(dashboardCss).not.toMatch(/report-date-(?:menu|presets|range|calendar|time)/);
  });
});
