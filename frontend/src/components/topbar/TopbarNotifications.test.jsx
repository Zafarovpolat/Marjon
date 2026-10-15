import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportsService } from "../../api/reports";
import { warehouseService } from "../../api/warehouse";
import TopbarNotifications from "./TopbarNotifications";

vi.mock("../../api/reports", () => ({
  reportsService: { listOrders: vi.fn() },
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
    reportsService.listOrders.mockResolvedValue({ data: [] });
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

  it("lists deficit rows and navigates to raw materials on click", async () => {
    render(<TopbarNotifications />);
    await screen.findByRole("button", { name: "Уведомления: 1" });
    fireEvent.click(screen.getByRole("button", { name: "Уведомления: 1" }));
    expect(await screen.findByText("Мука: дефицит")).toBeInTheDocument();
    expect(screen.getByText(/Остаток 2 кг из мин. 10/)).toBeInTheDocument();
    expect(screen.queryByText(/Сахар/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Мука: остаток ниже порога" }));
    expect(navigate).toHaveBeenCalledWith("/nomenclature/raw-materials");
  });

  it("hides deficit section when stock request fails, orders still work", async () => {
    warehouseService.listStock.mockRejectedValue({ response: { data: { detail: "Нет связи" } } });
    render(<TopbarNotifications />);
    await waitFor(() => expect(warehouseService.listStock).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Уведомлений нет" })).toBeInTheDocument();
  });
});
