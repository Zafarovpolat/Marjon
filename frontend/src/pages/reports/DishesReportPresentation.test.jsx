import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import BackButton from "../../components/BackButton";
import { reportsService } from "../../api/reports";
import DishesReportPage from "../DishesReportPage";
import { __resetReportCache } from "./reportResultCache";

vi.mock("../../api/reports", () => ({ reportsService: { listDishes: vi.fn(), getDishesFilters: vi.fn(), listOrders: vi.fn() } }));
const dish = { product_id: "p1", name: "Суп", unit: "шт", quantity: 2, price: 32000, amount: 64000, category_name: "Супы", cost_coverage_complete: true, cost_total: 20000, profit: 44000 };
const payload = rows => ({ data: { rows, totals: { quantity: 2, amount: 64000 } } });
function mount() { return render(<MemoryRouter initialEntries={["/reports/dishes"]}><BackButton /><DishesReportPage /></MemoryRouter>); }
beforeEach(() => {
  __resetReportCache(); vi.clearAllMocks();
  vi.spyOn(window.history, "length", "get").mockReturnValue(2);
  reportsService.getDishesFilters.mockResolvedValue({ data: {} });
  reportsService.listDishes.mockResolvedValue(payload([dish]));
  reportsService.listOrders.mockResolvedValue({ data: [{ order_id: "o23", order_number: "23", status: "completed", total_amount: 171500, position_quantity: 4, position_amount: 136000, created_at: "2026-10-20T09:03:00Z" }] });
});
it("places totals below rows and separates photo, number and dish name", async () => {
  mount();
  const row = await screen.findByRole("row", { name: "Детали блюда Суп" });
  expect(within(row).getAllByRole("cell")).toHaveLength(7);
  expect(within(row).getAllByRole("cell")[0]).toHaveTextContent("1");
  expect(within(row).getAllByRole("cell")[1]).toContainElement(within(row).getByLabelText("Нет фото"));
  expect(within(row).getAllByRole("cell")[2]).toHaveTextContent("Суп");
  const total = document.querySelector(".dishes-sales-table tfoot");
  expect(total).toHaveTextContent("2 шт");
  expect(document.querySelector(".dishes-sales-table tbody .report-total-row")).toBeNull();
  expect(screen.queryByText("Нажмите на блюдо, чтобы посмотреть продажи по заказам")).toBeNull();
});

it("changes both metrics and orders using the detail period button, keeping the parent report intact", async () => {
  mount();
  fireEvent.click(await screen.findByRole("row", { name: "Детали блюда Суп" }));
  await screen.findByText("23");
  reportsService.listDishes.mockResolvedValue(payload([{ ...dish, quantity: 4, amount: 128000 }]));
  fireEvent.click(screen.getByRole("button", { name: "Период продаж позиции" }));
  fireEvent.click(screen.getByRole("button", { name: "Вчера", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "ОК", exact: true }));
  await waitFor(() => expect(reportsService.listOrders).toHaveBeenCalledTimes(2));
  const latestDates = reportsService.listOrders.mock.calls.at(-1).slice(0, 2);
  expect(reportsService.listDishes).toHaveBeenLastCalledWith(...latestDates, expect.objectContaining({ filters: expect.objectContaining({ productId: ["p1"] }) }));
  expect(await screen.findByText("128 000 UZS")).toBeInTheDocument();
  expect(screen.getByText("4 шт")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Назад" }));
  expect(await screen.findByRole("table", { name: "Отчёт по блюдам" })).toBeInTheDocument();
  expect(within(screen.getByRole("row", { name: "Детали блюда Суп" })).getByText("2")).toBeInTheDocument();
});
it("does not sum pieces and kilograms into one meaningless number", async () => {
  reportsService.listDishes.mockResolvedValue(payload([dish, { ...dish, product_id: "p2", name: "Плов", unit: "кг", quantity: 0.5 }]));
  mount();
  await screen.findByText("Плов");
  expect(document.querySelector("tfoot")).toHaveTextContent("2 шт · 0,5 кг");
});
it("opens only the clicked product's orders, keeps historical cost and returns with Back", async () => {
  mount();
  const row = await screen.findByRole("row", { name: "Детали блюда Суп" });
  fireEvent.keyDown(row, { key: "Enter" });
  const orders = await screen.findByRole("table", { name: "Заказы с этой позицией" });
  expect(document.querySelectorAll(".dish-report-metrics > div")).toHaveLength(5);
  const header = document.querySelector(".dish-report-header");
  expect(header.children[0]).toHaveClass("owner-report-heading");
  expect(header.children[1]).toHaveClass("dish-report-metrics");
  expect(within(header.children[2]).getByRole("button", { name: "Период продаж позиции" })).toBeInTheDocument();
  expect(within(document.querySelector(".dish-report-metrics")).queryByText("Категория")).toBeNull();
  expect(screen.queryByRole("heading", { name: "Заказы с этой позицией" })).toBeNull();
  expect(await within(orders).findByText("23")).toBeInTheDocument();
  const headers = within(orders).getAllByRole("columnheader").map(cell => cell.textContent);
  expect(headers.slice(3, 6)).toEqual(["Официант", "Цена позиции в заказе", "Сумма заказа"]);
  expect(within(orders).getByText("4 / 136 000 UZS")).toBeInTheDocument();
  expect(screen.getByText("20 000 UZS")).toBeInTheDocument();
  expect(screen.getByText("44 000 UZS")).toBeInTheDocument();
  expect(reportsService.listOrders).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.objectContaining({ filters: expect.objectContaining({ productId: ["p1"] }) }));
  fireEvent.click(screen.getByRole("button", { name: "Назад" }));
  expect(await screen.findByRole("heading", { name: "Отчёт по блюдам" })).toBeInTheDocument();
  expect(reportsService.listDishes).toHaveBeenCalledTimes(1);
});
it("opens photos without navigating to the dish and handles broken photos", async () => {
  reportsService.listDishes.mockResolvedValue(payload([{ ...dish, image_url: "/dish.png" }]));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Открыть фото Суп" }));
  expect(screen.getByRole("dialog", { name: "Фото блюда Суп" })).toBeInTheDocument();
  expect(reportsService.listOrders).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Закрыть фото" }));
  fireEvent.error(document.querySelector(".dish-report-photo img"));
  expect(screen.getByLabelText("Нет фото")).toBeInTheDocument();
});
it("sorts quantity without altering report totals", async () => {
  reportsService.listDishes.mockResolvedValue(payload([dish, { ...dish, product_id: "p2", name: "Плов", quantity: 5 }]));
  mount();
  await screen.findByText("Плов");
  fireEvent.click(screen.getByRole("button", { name: "Сортировать по количеству" }));
  expect(document.querySelector("tbody tr")).toHaveTextContent("Плов");
  fireEvent.click(screen.getByRole("button", { name: "Сортировать по количеству" }));
  expect(document.querySelector("tbody tr")).toHaveTextContent("Суп");
  expect(document.querySelector("tfoot")).toHaveTextContent("64 000 UZS");
});
