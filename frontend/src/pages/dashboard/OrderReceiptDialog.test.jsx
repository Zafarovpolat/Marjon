import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KpiInfoDialog } from "./DashboardDialogs";
import OrderReceiptDialog from "./OrderReceiptDialog";
import { ordersService } from "../../api/orders";
import { paymentsService } from "../../api/payments";
import { getCustomerTemplate } from "../../api/receipt";

// Чек заказа из таблицы «Заказов»: строка открывает превью ровно такое же,
// как на странице «Настройки → Настройка чека» (тот же ReceiptPreview и
// сохранённый шаблон компании), и уходит с анимацией, а не мгновенно.

vi.mock("../../context/OrgContext", () => ({
  useOrg: () => ({ org: { name: "MARJON", logo: "https://cdn.test/logo.png", address: "Ташкент", phone: "+998 90 000 00 00" } }),
}));
vi.mock("../../components/Icon", () => ({ default: () => <span aria-hidden="true" /> }));
vi.mock("../../api/orders", () => ({ ordersService: { get: vi.fn() } }));
vi.mock("../../api/payments", () => ({ paymentsService: { listByOrder: vi.fn() } }));
vi.mock("../../api/receipt", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getCustomerTemplate: vi.fn() };
});

const KPI = {
  label: "Заказов",
  badge: "За выбранный период",
  value: "1",
  description: "Все заказы за выбранный период.",
  icon: "bi-receipt",
  orderReport: {
    rows: [
      { id: "order-1", number: "5", date_label: "17.10 19:57", place: "Стол 5", amount: "268800", status: "completed" },
    ],
    total: 268800,
  },
};

const ORDER = {
  id: "order-1",
  order_number: "5",
  order_type: "dine_in",
  table_number: "5",
  waiter_name: "Abdulaziz",
  discount_amount: 0,
  service_fee: 28800,
  tax_amount: 0,
  total_amount: 268800,
  created_at: "2026-10-25T17:24:00",
  items: [
    { id: 1, name: "Qozon kabob", quantity: 2, price: 72000, total: 144000, status: "served" },
    { id: 2, name: "Aysberg salati", quantity: 3, price: 28000, total: 84000, status: "served" },
    { id: 3, name: "Olchali kompot", quantity: 1, price: 12000, total: 12000, status: "cancelled" },
  ],
};

// Доступное имя чека — «№ 5» (aria-labelledby → h2 с номером заказа).
const receiptDialog = () => screen.queryByRole("dialog", { name: "№ 5" });
const findReceipt = () => screen.findByRole("dialog", { name: "№ 5" });
const orderRow = () => screen.getByRole("row", { name: /Открыть чек заказа №5/ });

function renderDialog() {
  const onClose = vi.fn();
  render(<KpiInfoDialog kpi={KPI} onClose={onClose} />);
  return { onClose };
}

describe("Order receipt dialog on the dashboard orders table", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ordersService.get.mockResolvedValue({ data: ORDER });
    paymentsService.listByOrder.mockResolvedValue({
      data: [
        { method: "cash", amount: 200000 },
        { method: "card", amount: 68800 },
      ],
    });
    getCustomerTemplate.mockResolvedValue({
      template: {
        blockStyles: { total: { size: "large", weight: "bold" } },
        separator: { pattern: "dashed", weight: "thin" },
      },
    });
  });

  it("keeps both staff rows returned by the real order API", async () => {
    ordersService.get.mockResolvedValue({ data: { ...ORDER, receipt_staff: [
      { label: "Кассир", name: "Азиз" }, { label: "Официант", name: "Абдулазиз" },
    ] } });
    renderDialog();
    fireEvent.click(orderRow());
    const dialog = await findReceipt();
    expect(await within(dialog).findByText("Кассир:")).toBeInTheDocument();
    expect(within(dialog).getByText("Азиз")).toBeInTheDocument();
    expect(within(dialog).getByText("Официант:")).toBeInTheDocument();
    expect(within(dialog).getByText("Абдулазиз")).toBeInTheDocument();
  });

  it("opens the clicked order as a centered receipt rendered by the shared preview", async () => {
    renderDialog();
    // Пока строку не нажали, чека нет.
    expect(receiptDialog()).toBeNull();

    const row = orderRow();
    expect(row.className).toMatch("owner-orders-report__row");
    fireEvent.click(row);

    const dialog = await findReceipt();
    // Центрированный слой: анимация входа идёт по общим переменным модалок.
    const backdrop = dialog.parentElement;
    expect(backdrop.className).toMatch("owner-modal-motion--centered");
    expect(backdrop.className).toMatch("is-motion-ready");
    // Тот же чековый скоуп, что на странице настроек: стили совпадают один в один.
    expect(dialog.querySelector(".receipt-dialog__body").className).toMatch("receipt-settings-page");
    expect(dialog.querySelector("[data-receipt-component='shared']")).not.toBeNull();

    // Содержимое чека — из настоящего заказа, а не демо-данные превью.
    for (const text of ["Qozon kabob", "Aysberg salati", "Наличные:", "Карта:"]) {
      expect(within(dialog).getByText(text)).toBeTruthy();
    }
    // Отменённая позиция на чек не попадает.
    expect(within(dialog).queryByText("Olchali kompot")).toBeNull();
    expect(ordersService.get).toHaveBeenCalledWith("order-1", expect.objectContaining({ signal: expect.anything() }));
    expect(paymentsService.listByOrder).toHaveBeenCalledTimes(1);
  });

  it("uses the saved company template, so the receipt matches the settings preview", async () => {
    renderDialog();
    fireEvent.click(orderRow());
    const dialog = await findReceipt();

    // Шаблон запрашивается у компании (как на странице настроек), а не берётся локально.
    await waitFor(() => expect(getCustomerTemplate).toHaveBeenCalledTimes(1));
    const preview = dialog.querySelector(".receipt-preview--customer");
    expect(preview).not.toBeNull();
    // Сохранённый «жирный» итог из шаблона доехал до чека.
    expect(preview.querySelector(".receipt-preview__total").className).toMatch("receipt-preview__block--weight-bold");
  });

  it("hides logo and contacts only in the viewer without changing the saved template", async () => {
    const saved = {
      enabled: { logo: true, address: true, phone: true },
      address: "Адрес из шаблона", phone: "+998 90 123 45 67",
      blockStyles: { total: { weight: "bold" } },
    };
    getCustomerTemplate.mockResolvedValue({ template: saved });
    renderDialog();
    fireEvent.click(orderRow());
    const dialog = await findReceipt();
    await within(dialog).findByText("Qozon kabob");
    expect(dialog.querySelector(".receipt-preview__logo")).toBeNull();
    for (const text of [saved.address, saved.phone, "Ташкент", "+998 90 000 00 00"]) {
      expect(within(dialog).queryByText(text)).toBeNull();
    }
    expect(saved.enabled).toEqual({ logo: true, address: true, phone: true });
    expect(within(dialog).getByText("MARJON")).toBeInTheDocument();
    expect(within(dialog).getByText("НОМЕР ЗАКАЗА")).toBeInTheDocument();
  });

  it.each(["small", "medium", "large", undefined])("always uses small line spacing when the saved setting is %s", async (lineSpacing) => {
    const saved = { lineSpacing };
    getCustomerTemplate.mockResolvedValue({ template: saved });
    renderDialog();
    fireEvent.click(orderRow());
    const dialog = await findReceipt();
    await within(dialog).findByText("Qozon kabob");
    expect(dialog.querySelector(".receipt-preview")).toHaveAttribute("data-line-spacing", "small");
    expect(saved.lineSpacing).toBe(lineSpacing);
  });

  it("keeps the final lines and bottom number in a long receipt", async () => {
    ordersService.get.mockResolvedValue({ data: { ...ORDER, items: Array.from({ length: 45 }, (_, index) => ({
      id: index, name: `Длинный чек — блюдо ${index + 1}`, quantity: 1, price: 1000, total: 1000, status: "served",
    })) } });
    renderDialog();
    fireEvent.click(orderRow());
    const dialog = await findReceipt();
    expect(await within(dialog).findByText("Длинный чек — блюдо 45")).toBeInTheDocument();
    expect(dialog.querySelectorAll(".receipt-preview__item-row")).toHaveLength(45);
    expect(within(dialog).getByText("Карта:")).toBeInTheDocument();
    expect(dialog.querySelector(".receipt-preview__bottomnum-value")).toHaveTextContent("5");
  });

  it("shows the order number at the bottom while keeping thank-you text hidden", async () => {
    // В шаблоне оба блока ВКЛЮЧЕНЫ (так их печатают), но в окне чека они не нужны:
    // номер заказа уже в шапке окна, благодарность — декор бумаги.
    getCustomerTemplate.mockResolvedValue({
      template: {
        enabled: { thankYouText: true, bottomOrderNumber: true },
        blockStyles: { bottomOrderNumber: { placement: "top", size: "large" } },
        thankYouText: "XARIDINGIZ UCHUN RAXMAT!",
      },
    });
    renderDialog();
    fireEvent.click(orderRow());
    const dialog = await findReceipt();
    await waitFor(() => expect(dialog.querySelector(".receipt-preview")).not.toBeNull());

    expect(dialog.querySelector(".receipt-preview__customer-footer .receipt-preview__bottomnum")).not.toBeNull();
    expect(within(dialog).queryByText("XARIDINGIZ UCHUN RAXMAT!")).toBeNull();
    expect(within(dialog).getByText("НОМЕР ЗАКАЗА")).toBeTruthy();
    // Остальной чек на месте: позиции, итог, оплата.
    expect(within(dialog).getByText("Qozon kabob")).toBeTruthy();
    expect(within(dialog).getByText("Наличные:")).toBeTruthy();
  });

  it("offers the details action only where the caller asks for it", async () => {
    renderDialog();
    fireEvent.click(orderRow());
    const dialog = await findReceipt();
    expect(within(dialog).queryByRole("button", { name: "Детали заказа" })).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Закрыть чек" }));
    await waitFor(() => expect(receiptDialog()).toBeNull());

    const onOpenDetails = vi.fn();
    render(
      <OrderReceiptDialog orderId="order-1" orderNumber="5" onClose={vi.fn()} onOpenDetails={onOpenDetails} />,
    );
    const withDetails = await findReceipt();
    fireEvent.click(within(withDetails).getByRole("button", { name: "Детали заказа" }));
    expect(onOpenDetails).toHaveBeenCalledTimes(1);
  });

  it("opens the receipt from the keyboard with Enter and Space", async () => {
    renderDialog();
    const row = orderRow();
    expect(row.tabIndex).toBe(0);

    fireEvent.keyDown(row, { key: "Enter" });
    const dialog = await findReceipt();

    fireEvent.click(within(dialog).getByRole("button", { name: "Закрыть чек" }));
    await waitFor(() => expect(receiptDialog()).toBeNull());

    fireEvent.keyDown(orderRow(), { key: " " });
    expect(await findReceipt()).toBeTruthy();
  });

  it("animates out before unmounting and keeps the orders table open", async () => {
    renderDialog();
    fireEvent.click(orderRow());
    const dialog = await findReceipt();
    const backdrop = dialog.parentElement;

    fireEvent.click(within(dialog).getByRole("button", { name: "Закрыть чек" }));

    // Сразу после клика чек ещё в DOM — с классом ухода, анимация играет.
    expect(backdrop.className).toMatch("is-motion-closing");
    expect(receiptDialog()).toBeTruthy();
    // Таблица заказов под чеком не закрывается.
    expect(screen.getByRole("region", { name: "Таблица заказов" })).toBeTruthy();

    await waitFor(() => expect(receiptDialog()).toBeNull());
    expect(screen.getByRole("region", { name: "Таблица заказов" })).toBeTruthy();
  });

  it("closes only the receipt on Escape, leaving the KPI dialog open", async () => {
    renderDialog();
    fireEvent.click(orderRow());
    const dialog = await findReceipt();

    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });

    expect(dialog.parentElement.className).toMatch("is-motion-closing");
    await waitFor(() => expect(receiptDialog()).toBeNull());
    // Верхний слой закрылся, нижний (таблица заказов) остался.
    expect(screen.getByRole("region", { name: "Таблица заказов" })).toBeTruthy();
  });

  it("shows a readable error when the order cannot be loaded", async () => {
    ordersService.get.mockRejectedValueOnce(new Error("boom"));
    renderDialog();
    fireEvent.click(orderRow());

    const dialog = await findReceipt();
    expect(await within(dialog).findByRole("alert")).toHaveProperty(
      "textContent",
      "Не удалось загрузить чек заказа.",
    );
  });
});
