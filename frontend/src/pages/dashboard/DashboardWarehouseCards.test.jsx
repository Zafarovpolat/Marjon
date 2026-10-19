import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OwnerDashboard from "../OwnerDashboard";
import { dashboardService } from "../../api/dashboard";
import { warehouseService } from "../../api/warehouse";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
vi.mock("../../api/dashboard", () => ({ dashboardService: { loadOwnerOverview: vi.fn() } }));
vi.mock("../../api/warehouse", () => ({ warehouseService: { list: vi.fn(), listStock: vi.fn(), listOutgoingReport: vi.fn() } }));
vi.mock("../../api/client", () => ({ formatMoney: (v) => `${Number(v || 0)} UZS`, formatNumber: (v) => String(v || 0) }));
vi.mock("../../components/Icon", () => ({ default: () => <span /> }));
vi.mock("../../components/Loader", () => ({ PageLoader: () => <div>loading</div> }));
vi.mock("./RevenueChart", () => ({ default: () => <div data-testid="chart" /> }));
vi.mock("./DashboardDialogs", () => ({ KpiInfoDialog: () => null, WarehouseReportDialog: () => null }));
vi.mock("./DashboardCards", () => ({ EmptyState: ({ title }) => <div>{title}</div>, TopSalesCard: () => null, RecentOrdersCard: () => null }));

function report(total = 21000) {
  return { data: { total: String(total), rows: [{ key: "wh", name: "Главный склад", product: String(total), tovar: "0", raw: String(total) }],
    lines: total ? [{ warehouseKey: "wh", qty: "3", sum: String(total) }] : [] } };
}
const card = (name) => screen.getByText(name).closest("button");
describe("dashboard persisted outgoing report", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.history.replaceState({}, "", "/?date_from=2026-10-12&date_to=2026-10-17");
    dashboardService.loadOwnerOverview.mockResolvedValue(Array.from({ length: 8 }, () => ({ data: [] })));
    warehouseService.list.mockResolvedValue({ data: [{ date: "2026-10-16", total_amount: 150000 }, { date: "2026-10-11", total_amount: 99999 }] });
    warehouseService.listStock.mockResolvedValue({ data: [{ quantity: 10, cost_price: 500 }] });
    warehouseService.listOutgoingReport.mockResolvedValue(report());
  });

  it("shows the exact 21000 table total, preserving incoming and stock calculations", async () => {
    render(<OwnerDashboard />);
    await waitFor(() => expect(card("Расход товаров")).toHaveTextContent("21000 UZS"));
    expect(card("Приход товаров")).toHaveTextContent("150000 UZS");
    expect(card("Остаток склада")).toHaveTextContent("5000 UZS");
    expect(warehouseService.listOutgoingReport).toHaveBeenCalledWith("2026-10-12", "2026-10-17", { signal: expect.any(AbortSignal) });
    expect(warehouseService.list.mock.calls.every(([section]) => section === "incoming")).toBe(true);
  });

  it("preserves navigation for loaded warehouse cards", async () => {
    render(<OwnerDashboard />);
    await waitFor(() => expect(card("Расход товаров")).toHaveTextContent("21000 UZS"));
    for (const [name, path] of [["Приход товаров", "incoming"], ["Расход товаров", "outgoing"], ["Остаток склада", "stock"]]) {
      fireEvent.click(card(name));
      expect(navigate).toHaveBeenLastCalledWith(`/stock-report/${path}${path === "outgoing" ? "?date_from=2026-10-12&date_to=2026-10-17" : ""}`);
    }
  });

  it("keeps a successful empty period as zero", async () => {
    warehouseService.listOutgoingReport.mockResolvedValue(report(0));
    render(<OwnerDashboard />);
    await waitFor(() => expect(card("Приход товаров")).toHaveTextContent("150000 UZS"));
    fireEvent.click(card("Расход товаров"));
    expect(navigate).toHaveBeenCalledWith("/stock-report/outgoing?date_from=2026-10-12&date_to=2026-10-17");
    expect(card("Расход товаров")).toHaveTextContent("0 UZS");
  });

  it.each(["offline", "malformed", "inconsistent"])("does not expose an incomplete total on %s", async (failure) => {
    if (failure === "offline") warehouseService.listOutgoingReport.mockRejectedValue(new Error("offline"));
    if (failure === "malformed") warehouseService.listOutgoingReport.mockResolvedValue({ data: [] });
    if (failure === "inconsistent") warehouseService.listOutgoingReport.mockResolvedValue({ data: { ...report().data, total: "99999" } });
    render(<OwnerDashboard />);
    await waitFor(() => expect(card("Приход товаров")).toHaveTextContent("150000 UZS"));
    fireEvent.click(card("Расход товаров"));
    expect(navigate).not.toHaveBeenCalled();
    expect(card("Расход товаров")).not.toHaveTextContent("21000 UZS");
  });

  it("ignores a late report for an old period", async () => {
    let resolveOld;
    warehouseService.listOutgoingReport.mockImplementation((from) => from === "2026-10-12"
      ? new Promise((resolve) => { resolveOld = resolve; }) : Promise.resolve(report(0)));
    render(<OwnerDashboard />);
    fireEvent.click(await screen.findByRole("button", { name: "Период выручки" }));
    fireEvent.change(screen.getByLabelText("Начало периода"), { target: { value: "18.10.2026 | 00:00" } });
    fireEvent.change(screen.getByLabelText("Конец периода"), { target: { value: "18.10.2026 | 00:00" } });
    fireEvent.click(document.querySelector(".report-date-ok"));
    await waitFor(() => expect(warehouseService.listOutgoingReport).toHaveBeenLastCalledWith("2026-10-18", "2026-10-18", { signal: expect.any(AbortSignal) }));
    expect(warehouseService.listOutgoingReport.mock.calls[0][2].signal.aborted).toBe(true);
    await act(async () => resolveOld(report()));
    expect(card("Расход товаров")).toHaveTextContent("0 UZS");
  });

  it("recomputes after reload without accumulating totals", async () => {
    const first = render(<OwnerDashboard />);
    await waitFor(() => expect(card("Расход товаров")).toHaveTextContent("21000 UZS"));
    first.unmount(); render(<OwnerDashboard />);
    await waitFor(() => expect(card("Расход товаров")).toHaveTextContent("21000 UZS"));
    expect(warehouseService.listOutgoingReport).toHaveBeenCalledTimes(2);
  });
});
