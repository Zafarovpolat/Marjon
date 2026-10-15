import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OwnerDashboard from "../OwnerDashboard";
import { dashboardService } from "../../api/dashboard";
import { warehouseService } from "../../api/warehouse";

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("../../api/dashboard", () => ({
  dashboardService: { loadOwnerOverview: vi.fn() },
}));

vi.mock("../../api/warehouse", () => ({
  warehouseService: {
    list: vi.fn(),
    listStock: vi.fn(),
  },
}));

vi.mock("../../api/client", () => ({
  formatMoney: (value) => `${Number(value || 0)} UZS`,
  formatNumber: (value) => String(Number(value || 0)),
}));

vi.mock("../../components/Icon", () => ({ default: () => <span aria-hidden="true" /> }));
vi.mock("../../components/Loader", () => ({ PageLoader: () => <div>loading</div> }));
vi.mock("../dashboard/RevenueChart", () => ({ default: () => <div data-testid="revenue-chart-probe" /> }));
vi.mock("../dashboard/DashboardDialogs", () => ({
  KpiInfoDialog: () => null,
  WarehouseReportDialog: () => null,
}));
vi.mock("../dashboard/DashboardCards", () => ({
  EmptyState: ({ title }) => <div>{title}</div>,
  TopSalesCard: () => <div data-testid="top-sales" />,
  RecentOrdersCard: () => <div data-testid="recent-orders" />,
}));

function overviewWith(salesRows = []) {
  return [
    { data: {} },
    { data: salesRows },
    { data: [] },
    { data: [] },
    { data: [] },
    { data: [] },
    { data: [] },
    { data: [] },
  ];
}

function isoToday() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

describe("OWNER dashboard warehouse cards (live totals + navigation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
    dashboardService.loadOwnerOverview.mockResolvedValue(overviewWith([]));
  });

  it("shows real incoming/outgoing/stock totals for the dashboard period", async () => {
    const today = isoToday();
    warehouseService.list.mockImplementation(async (section) => {
      if (section === "incoming") {
        return { data: [
          { id: "d1", total_amount: 2500, date: today, registered_at: "" },
          { id: "d2", total_amount: 3000, date: today, registered_at: "" },
          // Вчерашний документ в сегодняшнюю сумму не входит.
          { id: "d0", total_amount: 99999, date: "2020-01-01", registered_at: "" },
        ] };
      }
      if (section === "outgoing") {
        return { data: [{ id: "e1", total_amount: 700, date: today, registered_at: "" }] };
      }
      return { data: [] };
    });
    warehouseService.listStock.mockResolvedValue({ data: [
      { quantity: 10, cost_price: 1000 },
      { quantity: 5, cost_price: 500 },
    ] });

    render(<OwnerDashboard />);

    expect(await screen.findByTestId("revenue-chart-probe")).toBeInTheDocument();
    expect(screen.getByText("Приход товаров").closest("button")).toHaveTextContent("5500 UZS");
    expect(screen.getByText("Расход товаров").closest("button")).toHaveTextContent("700 UZS");
    expect(screen.getByText("Остаток склада").closest("button")).toHaveTextContent("12500 UZS");
  });

  it("navigates into Приход/Расход/Остаток subcategories on click", async () => {
    const today = isoToday();
    warehouseService.list.mockResolvedValue({ data: [{ id: "d1", total_amount: 100, date: today, registered_at: "" }] });
    warehouseService.listStock.mockResolvedValue({ data: [] });

    render(<OwnerDashboard />);
    await screen.findByTestId("revenue-chart-probe");

    fireEvent.click(screen.getByText("Приход товаров").closest("button"));
    expect(mockNavigate).toHaveBeenCalledWith("/stock-report/incoming");

    fireEvent.click(screen.getByText("Расход товаров").closest("button"));
    expect(mockNavigate).toHaveBeenCalledWith("/stock-report/outgoing");

    fireEvent.click(screen.getByText("Остаток склада").closest("button"));
    expect(mockNavigate).toHaveBeenCalledWith("/stock-report/stock");
  });

  it("keeps cards dead on warehouse API failure (honest unavailable)", async () => {
    warehouseService.list.mockRejectedValue(new Error("offline"));
    warehouseService.listStock.mockRejectedValue(new Error("offline"));

    render(<OwnerDashboard />);
    await screen.findByTestId("revenue-chart-probe");

    expect(screen.getByText("Приход товаров").closest("button")).toHaveTextContent("0 UZS");
    fireEvent.click(screen.getByText("Приход товаров").closest("button"));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
