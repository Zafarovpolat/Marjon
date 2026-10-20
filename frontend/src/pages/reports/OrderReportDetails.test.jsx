import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import OrderReportDetails from "./OrderReportDetails";
import { loadOrder, loadOrderPayments, paymentSummary } from "./orderDetailData";

vi.mock("./orderDetailData", async (original) => ({ ...await original(), loadOrder: vi.fn(), loadOrderPayments: vi.fn() }));
const row = { id: "uuid23", orderNumber: "23", status: "completed", createdAt: "2026-10-20T09:03:00Z", hallName: "Зал 1", tableNumber: "4", waiterName: "Азиз", cashierNames: ["Азиз"], orderType: "dine_in" };
const order = { status: "completed", service_fee: "0", total_amount: "171500", items: [
  { id: "i1", name: "Суп", quantity: "2", price: "32000", total: "64000", status: "pending" },
  { id: "i2", name: "Остальные блюда", quantity: "1", price: "107500", total: "107500", status: "pending" },
  { id: "i3", name: "Отменённое блюдо", quantity: "1", price: "100", total: "0", status: "cancelled" },
] };
beforeEach(() => {
  vi.clearAllMocks();
  loadOrder.mockResolvedValue({ data: order });
  loadOrderPayments.mockResolvedValue({ data: [{ method: "cash", status: "completed", amount: "171500", updated_at: "2026-10-20T09:05:00Z" }] });
});
it("shows order and status at the edges of the metadata row with a full-width item table", async () => {
  render(<OrderReportDetails row={row} />);
  const table = screen.getByRole("table", { name: "Состав заказа" });
  expect(await within(table).findByText("Суп")).toBeInTheDocument();
  expect(within(table).getAllByRole("columnheader").map(el => el.textContent)).toEqual(["№", "Блюдо / товар", "Кол-во", "Цена (UZS)", "Сумма (UZS)"]);
  expect(screen.queryByText("Отменённое блюдо")).toBeNull();
  const metadata = document.querySelector(".order-report-detail__metadata");
  expect(metadata.firstElementChild).toHaveTextContent("Заказ №23");
  expect(metadata.lastElementChild).toHaveTextContent("Завершён");
  expect(screen.queryByText("ОТЧЁТЫ / ОТЧЁТ ПО ЗАКАЗАМ")).toBeNull();
  expect(screen.queryByRole("region", { name: "Оплата" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Скачать чек" })).toBeNull();
  expect(screen.getByText("20.10.2026, 14:03")).toBeInTheDocument();
  expect(screen.queryByText("Сдача")).toBeNull();
  expect(screen.queryByText("Скидка")).toBeNull();
  expect(screen.queryByText("Подытог")).toBeNull();
  expect(screen.queryByText(/Демонстрационный/)).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("heading", { name: "Состав заказа" })).toBeNull();
  expect(screen.getByText("Зал 1, стол 4")).toBeInTheDocument();
  expect(loadOrder).toHaveBeenCalledWith("uuid23", expect.any(AbortSignal));
});
it("combines identical dishes while preserving prices, modifiers and cancelled exclusions", async () => {
  const sushi = { product_id: "sushi", name: "Суши", quantity: "1", price: "34000", total: "34000", status: "pending" };
  loadOrder.mockResolvedValue({ data: { ...order, items: [
    { ...sushi, id: "s1" }, { ...sushi, id: "s2" }, { ...sushi, id: "s3" },
    { ...sushi, id: "old-price", price: "30000", total: "30000" },
    { ...sushi, id: "modified", modifiers: [{ name: "Соус" }] },
    { ...sushi, id: "cancelled", status: "cancelled" },
  ] } });
  render(<OrderReportDetails row={row} />);
  const table = screen.getByRole("table", { name: "Состав заказа" });
  await within(table).findAllByText("Суши");
  const rows = within(table).getAllByRole("row");
  expect(rows).toHaveLength(5);
  const cells = within(rows[1]).getAllByRole("cell");
  expect(cells[2]).toHaveTextContent(/^3$/);
  expect(cells[3]).toHaveTextContent("34 000");
  expect(cells[4]).toHaveTextContent("102 000");
});
it("does not request payment data for the removed panel", async () => {
  render(<OrderReportDetails row={row} />);
  await screen.findByText("Суп");
  expect(loadOrderPayments).not.toHaveBeenCalled();
  expect(screen.queryByText("Оплата подтверждена")).toBeNull();
});
it("shows an order loading error and allows retry without fabricated rows", async () => {
  loadOrder.mockRejectedValueOnce(new Error("offline"));
  render(<OrderReportDetails row={row} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить состав заказа");
  expect(screen.queryByText("Суп")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
  expect(await screen.findByText("Суп")).toBeInTheDocument();
});
it("does not publish stale details after switching orders", async () => {
  let resolve;
  loadOrder.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  const view = render(<OrderReportDetails row={row} />);
  view.rerender(<OrderReportDetails row={{ ...row, id: "uuid24", orderNumber: "24" }} />);
  await screen.findByText("Суп");
  resolve({ data: { ...order, items: [{ name: "Старый ответ", quantity: 1, total: 1, price: 1 }] } });
  await waitFor(() => expect(screen.queryByText("Старый ответ")).toBeNull());
});
it("aggregates split completed payments without counting failed or refunded payments", () => {
  const result = paymentSummary([
    { amount: "100.10", status: "completed", method: "cash", updated_at: "2026-10-20T09:00:00Z" },
    { amount: "50.20", status: "completed", method: "card", updated_at: "2026-10-20T09:05:00Z" },
    { amount: "1000", status: "failed", method: "card" }, { amount: "1000", status: "refunded", method: "cash" },
  ], "150.30");
  expect(result.amount).toBe(150.3);
  expect(result.paid).toBe(true);
  expect(result.methods).toEqual(["cash", "card"]);
});
