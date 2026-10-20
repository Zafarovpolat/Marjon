import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportsService } from "../../api/reports";
import { warehouseService } from "../../api/warehouse";
import TopbarNotifications from "./TopbarNotifications";
import { cancellationAcknowledgements } from "../../api/cancellationAcknowledgements";
vi.mock("../../api/cancellationAcknowledgements", () => ({
  cancellationAcknowledgements: { list: vi.fn(), acknowledge: vi.fn() },
}));

vi.mock("../../api/reports", () => ({
  reportsService: { listOrders: vi.fn(), listCancelledDishes: vi.fn() },
}));
vi.mock("../../api/warehouse", () => ({
  warehouseService: {
    listStock: vi.fn(),
    listIngredients: vi.fn(),
  },
}));
vi.mock("../../components/Icon", () => ({ default: () => <span aria-hidden="true" /> }));
vi.mock("../../components/Loader", () => ({
  InlineLoader: ({ text }) => <div>{text}</div>,
}));

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

describe("Topbar low-stock alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cancellationAcknowledgements.list.mockResolvedValue({ data: [] });
    reportsService.listOrders.mockResolvedValue({ data: [] });
    reportsService.listCancelledDishes.mockResolvedValue({ data: [] });
    warehouseService.listStock.mockResolvedValue({
      data: [
        { warehouse_id: "wh-1", ingredient_id: "ing-1", quantity: 2, min_quantity: 10, unit: "кг" },
        { warehouse_id: "wh-1", ingredient_id: "ing-2", quantity: 50, min_quantity: 5, unit: "кг" },
      ],
    });
    warehouseService.listIngredients.mockResolvedValue({
      data: [
        { id: "ing-1", name: "Мука", unit: "кг" },
        { id: "ing-2", name: "Сахар", unit: "кг" },
      ],
    });
  });

  it("polls low stock on mount and badges only rows below threshold", async () => {
    render(<TopbarNotifications />);
    await waitFor(() => expect(warehouseService.listStock).toHaveBeenCalledWith(
      expect.objectContaining({ params: { low_stock: true } }),
    ));
    // ing-1 ниже порога (2 < 10), ing-2 в норме — бейдж = 1.
    const bell = await screen.findByRole("button", { name: "Уведомления: 1" });
    expect(bell).toBeInTheDocument();
  });

  it("navigates to the stock of the warehouse where the deficit sits", async () => {
    render(<TopbarNotifications />);
    await screen.findByRole("button", { name: "Уведомления: 1" });
    fireEvent.click(screen.getByRole("button", { name: "Уведомления: 1" }));
    expect(await screen.findByText("Мука: дефицит")).toBeInTheDocument();
    expect(screen.getByText(/Остаток 2 кг из мин. 10/)).toBeInTheDocument();
    expect(screen.queryByText(/Сахар/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Мука: остаток ниже порога" }));
    // Склад берётся из самой строки остатка, сырьё — параметром, чтобы
    // на складе раскрылась только его категория.
    expect(navigate).toHaveBeenCalledWith("/stock-report/stock/wh-1?ingredient=ing-1");
  });

  it("falls back to raw materials when the deficit row has no warehouse", async () => {
    warehouseService.listStock.mockResolvedValue({
      data: [{ ingredient_id: "ing-1", quantity: 2, min_quantity: 10, unit: "кг" }],
    });
    render(<TopbarNotifications />);
    await screen.findByRole("button", { name: "Уведомления: 1" });
    fireEvent.click(screen.getByRole("button", { name: "Уведомления: 1" }));
    fireEvent.click(await screen.findByRole("button", { name: "Мука: остаток ниже порога" }));
    expect(navigate).toHaveBeenCalledWith("/nomenclature/raw-materials");
  });

  it("hides deficit section when stock request fails, orders still work", async () => {
    warehouseService.listStock.mockRejectedValue({ response: { data: { detail: "Нет связи" } } });
    render(<TopbarNotifications />);
    await waitFor(() => expect(warehouseService.listStock).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Уведомлений нет" })).toBeInTheDocument();
  });

  it("requests whole-order cancellations with an explicit status filter", async () => {
    render(<TopbarNotifications />);
    await waitFor(() => expect(reportsService.listOrders).toHaveBeenCalledWith(
      expect.any(String), expect.any(String),
      expect.objectContaining({ filters: { orderStatus: ["cancelled"] } }),
    ));
  });

  it("lists whole-order cancellations from the filtered report", async () => {
    warehouseService.listStock.mockResolvedValue({ data: [] });
    reportsService.listOrders.mockResolvedValue({
      data: [{ order_id: "o-1", order_number: "42", status: "cancelled", table_number: "5", total_amount: 100000 }],
    });
    render(<TopbarNotifications />);
    const bell = await screen.findByRole("button", { name: "Уведомления: 1" });
    fireEvent.click(bell);
    expect(await screen.findByText("Заказ №42 отменён")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Заказ №42 отменён" }));
    const target = new URL(navigate.mock.calls.at(-1)[0], "http://localhost");
    expect(target.pathname).toBe("/reports/cancelled-dishes");
    expect(target.searchParams.get("cancelledOrder")).toBe("order:o-1");
    expect(target.searchParams.get("eventDate")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(bell).toHaveAttribute("aria-expanded", "false");
  });

  it("hides persisted acknowledged orders and immediately handles a new acknowledgement", async () => {
    warehouseService.listStock.mockResolvedValue({ data: [] });
    reportsService.listOrders.mockResolvedValue({ data: [
      { order_id: "old", order_number: "1", status: "cancelled", created_at: "2026-10-20T05:00:00Z" },
      { order_id: "new", order_number: "2", status: "cancelled", created_at: "2026-10-20T05:00:00Z" },
    ] });
    cancellationAcknowledgements.list.mockResolvedValue({ data: [{ order_id: "old", acknowledged_at: "2026-10-20T06:00:00Z" }] });
    render(<TopbarNotifications />);
    const bell = await screen.findByRole("button", { name: "Уведомления: 1" });
    fireEvent.click(bell);
    expect(screen.queryByText("Заказ №1 отменён")).toBeNull();
    expect(screen.getByText("Заказ №2 отменён")).toBeInTheDocument();
    fireEvent(window, new CustomEvent("marjon:cancellation-acknowledged", { detail: { order_id: "new", acknowledged_at: "2026-10-20T06:00:00Z" } }));
    expect(await screen.findByRole("button", { name: "Уведомлений нет" })).toBeInTheDocument();
    expect(screen.queryByText("Заказ №2 отменён")).toBeNull();
  });

  it("lists item-scope dish cancellations and hides order-scope doubles", async () => {
    // Дефицит глушим, чтобы бейдж считал только отмену блюда.
    warehouseService.listStock.mockResolvedValue({ data: [] });
    reportsService.listCancelledDishes.mockResolvedValue({
      data: [
        {
          order_item_id: "li-1", order_id: "o-9", name: "Салат", quantity: 2, unit: "порц",
          table_number: "5", cancelled_by_name: "Анна", cancellation_scope: "item",
        },
        {
          order_item_id: "li-2", order_id: "o-9", name: "Салат", quantity: 2, unit: "порц",
          table_number: "5", cancelled_by_name: "Анна", cancellation_scope: "order",
        },
      ],
    });
    render(<TopbarNotifications />);
    const bell = await screen.findByRole("button", { name: "Уведомления: 1" });
    expect(bell).toBeInTheDocument();
    fireEvent.click(bell);
    expect(await screen.findByText("Салат ×2 — отмена")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Салат: отмена блюда" }));
    expect(navigate).toHaveBeenCalledWith("/reports/cancelled-dishes");
  });

  it("uses card deficit threshold when row has no own threshold", async () => {
    warehouseService.listStock.mockResolvedValue({
      data: [
        // Своя min_quantity = 0 → действует порог из карточки (20): 8 < 20.
        { warehouse_id: "wh-1", ingredient_id: "ing-1", quantity: 8, min_quantity: 0, unit: "кг" },
        // Своя min_quantity = 5 конкретнее карточки (20): 8 > 5 → норма.
        { warehouse_id: "wh-1", ingredient_id: "ing-2", quantity: 8, min_quantity: 5, unit: "кг" },
      ],
    });
    warehouseService.listIngredients.mockResolvedValue({
      data: [
        { id: "ing-1", name: "Мука", unit: "кг", deficit_threshold: 20 },
        { id: "ing-2", name: "Сахар", unit: "кг", deficit_threshold: 20 },
      ],
    });
    render(<TopbarNotifications />);
    const bell = await screen.findByRole("button", { name: "Уведомления: 1" });
    expect(bell).toBeInTheDocument();
    fireEvent.click(bell);
    expect(await screen.findByText("Мука: дефицит")).toBeInTheDocument();
    expect(screen.getByText(/Остаток 8 кг из мин. 20/)).toBeInTheDocument();
    expect(screen.queryByText(/Сахар/)).toBeNull();
  });
});
