import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  KITCHEN_BLOCKS,
  buildKitchenTemplate,
  getKitchenTemplate,
  migrateKitchenTemplate,
  saveKitchenTemplate,
  testPrintKitchen,
} from "../../api/receipt";
import ChefReceiptSettingsPage from "./ChefReceiptSettingsPage";

vi.mock("../../api/receipt", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getKitchenTemplate: vi.fn(),
    saveKitchenTemplate: vi.fn(() => Promise.resolve({ template: {}, source: "api" })),
    testPrintKitchen: vi.fn(() => Promise.resolve({ ok: true, source: "local" })),
  };
});

beforeEach(() => {
  getKitchenTemplate.mockImplementation(() =>
    Promise.resolve({ template: buildKitchenTemplate(), source: "api" }),
  );
  saveKitchenTemplate.mockImplementation(() => Promise.resolve({ template: {}, source: "api" }));
});

describe("ChefReceiptSettingsPage (kitchen)", () => {
  it("configures and saves dish text size and weight without hiding kitchen items", async () => {
    const { container } = render(<ChefReceiptSettingsPage />);
    await screen.findByText("Текст позиций");
    const row = container.querySelector('[data-block-row="dishItems"]');
    expect(within(row).queryByRole("checkbox")).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Очень большой" }));
    const weightGroup = within(row).getByText("Жирность").parentElement;
    fireEvent.click(within(weightGroup).getByRole("button", { name: "Стандартный" }));
    expect(container.querySelector('.receipt-preview__items--kitchen .receipt-preview__item-row')).toHaveStyle({ fontSize: '23.75px', fontWeight: '400' });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(saveKitchenTemplate).toHaveBeenCalled());
    expect(saveKitchenTemplate.mock.calls.at(-1)[0].blockStyles.dishItems).toEqual({ size: 'xlarge', weight: 'standard' });
  });
  it("does not flash editable defaults or the preview while the server template is pending", async () => {
    let resolve;
    getKitchenTemplate.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const { container } = render(<ChefReceiptSettingsPage />);
    expect(screen.getByRole("heading", { name: "Настройка чека повара" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Загрузка шаблона чека…");
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
    expect(container.querySelector("[data-receipt-print-root]")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Номер заказа", exact: true })).toBeNull();
    const saved = buildKitchenTemplate();
    saved.enabled.orderNumber = false;
    await act(async () => resolve({ template: saved, source: "api" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Номер заказа", exact: true })).not.toBeChecked();
    expect(container.querySelector("[data-receipt-print-root]")).not.toBeNull();
    expect(saveKitchenTemplate).not.toHaveBeenCalled();
  });

  it("keeps the existing explicit fallback when template loading fails", async () => {
    getKitchenTemplate.mockRejectedValueOnce(new Error("offline"));
    render(<ChefReceiptSettingsPage />);
    await screen.findByText(/Не удалось загрузить серверный шаблон кухни/);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Номер заказа", exact: true })).toBeChecked();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled();
  });

  const SEVEN_LABELS = [
    "Номер заказа",
    "Тип заказа",
    "Номер стола",
    "Официант",
    "Заказы (показать сумму)",
    "Дата",
    "Комментарий",
  ];

  it("renders exactly the 7 chef settings without the kitchen params card", async () => {
    const { container } = render(<ChefReceiptSettingsPage />);
    expect(await screen.findByRole("heading", { name: "Настройка чека повара" })).toBeInTheDocument();
    await waitFor(() => expect(getKitchenTemplate).toHaveBeenCalled());
    expect(screen.queryByText("Параметры кухни")).toBeNull();
    expect(screen.queryByRole("button", { name: "Сбросить" })).toBeNull();
    expect(screen.queryByText(/Автопечать нового заказа/)).toBeNull();
    expect(container.querySelector(".receipt-subcard select")).toBeNull();
    const rows = container.querySelectorAll("[data-block-row]");
    expect(rows).toHaveLength(8);
    for (const label of SEVEN_LABELS) {
      expect(screen.getByRole("checkbox", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole("checkbox", { name: "Номер заказа (Отмена)" })).toBeNull();
  });

  it("groups rows exactly like the customer editor (order/sums/comment)", async () => {
    const { container } = render(<ChefReceiptSettingsPage />);
    await screen.findByRole("heading", { name: "Настройка чека повара" });
    // Заголовки групп (класс заголовка — текст "Комментарий" есть и у строки).
    const titles = [...container.querySelectorAll(".receipt-section-group__title")].map((el) => el.textContent);
    expect(titles).toEqual(["Информация о заказе", "Позиции блюд", "Суммы", "Комментарий"]);
    const inGroup = (key) => container.querySelector(`[data-block-group="${key}"]`);
    const rowsIn = (key) => [...inGroup(key).querySelectorAll("[data-block-row]")].map((r) => r.dataset.blockRow);
    expect(rowsIn("order")).toEqual(["orderNumber", "orderType", "table", "waiter", "date"]);
    expect(rowsIn("sums")).toEqual(["showOrderSum"]);
    expect(rowsIn("notes")).toEqual(["comment"]);
  });

  it("keeps Save in the header and nowhere else (no print, no bottom save)", async () => {
    const { container } = render(<ChefReceiptSettingsPage />);
    await screen.findByRole("heading", { name: "Настройка чека повара" });
    expect(screen.queryByRole("button", { name: "Печать предпросмотра" })).toBeNull();
    const actions = container.querySelector(".receipt-editor-actions.receipt-editor-actions--end");
    expect(actions).not.toBeNull();
    const headerSave = actions.querySelector(".receipt-btn-primary.receipt-save");
    expect(headerSave).not.toBeNull();
    expect(headerSave).toHaveTextContent("Сохранить");
    expect(container.querySelector(".receipt-editor .receipt-editor-save")).toBeNull();
    const header = container.querySelector(".settings-header.receipt-header");
    expect(header.querySelector(".receipt-btn-secondary")).toBeNull();
    expect(header.querySelector(".receipt-btn-primary")).not.toBeNull();
  });

  it("does not expose removed chef settings", async () => {
    render(<ChefReceiptSettingsPage />);
    await screen.findByRole("heading", { name: "Настройка чека повара" });
    for (const label of ["Позиции", "Модификаторы", "Приоритет", "Комментарий к позиции", "Время создания"]) {
      expect(screen.queryByRole("checkbox", { name: label })).toBeNull();
    }
    expect(screen.queryByText("Размер бумаги")).toBeNull();
  });

  it("gives orderNumber 4 size modes with align+weight, orderType size+weight only", async () => {
    const { container } = render(<ChefReceiptSettingsPage />);
    await screen.findByRole("heading", { name: "Настройка чека повара" });
    const row = (block) => container.querySelector(`[data-block-row="${block}"]`);
    const groupLabels = (block) => [...row(block).querySelectorAll(".receipt-segment-group > span")].map((s) => s.textContent);
    expect(groupLabels("orderNumber")).toEqual(["Размер текста", "Выравнивание", "Жирность"]);
    expect(groupLabels("showOrderSum")).toEqual(["Размер текста", "Жирность"]);
    expect(groupLabels("orderType")).toEqual(["Размер текста", "Жирность"]);
    expect(groupLabels("table")).toEqual(["Размер текста", "Жирность"]);
    expect(groupLabels("waiter")).toEqual(["Размер текста", "Жирность"]);
    expect(groupLabels("date")).toEqual(["Размер текста", "Жирность"]);
    expect(groupLabels("comment")).toEqual(["Размер текста", "Жирность"]);
    const sizeButtons = (block) => [...row(block).querySelectorAll(".receipt-segment-group")[0].querySelectorAll("button")].map((b) => b.textContent);
    expect(sizeButtons("orderNumber")).toEqual(["Стандартный", "Большой", "Очень большой"]);
    expect(sizeButtons("showOrderSum")).toEqual(["Стандартный", "Большой", "Очень большой"]);
    expect(sizeButtons("orderType")).toEqual(["Стандартный", "Большой", "Очень большой"]);
  });

  it("shows no Средний option anywhere on the chef page", async () => {
    render(<ChefReceiptSettingsPage />);
    await screen.findByRole("heading", { name: "Настройка чека повара" });
    expect(screen.queryByRole("button", { name: "Средний" })).toBeNull();
  });

  it("collapses details OFF without erasing stored style state", async () => {
    const { container } = render(<ChefReceiptSettingsPage />);
    await screen.findByRole("heading", { name: "Настройка чека повара" });
    fireEvent.click(screen.getAllByRole("button", { name: "Очень большой", exact: true })[0]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Номер заказа", exact: true }));
    const row = container.querySelector('[data-block-row="orderNumber"]');
    expect(row.querySelector(".receipt-section-row__details")).not.toHaveClass("is-open");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(saveKitchenTemplate).toHaveBeenCalledTimes(1));
    const saved = saveKitchenTemplate.mock.calls[0][0];
    expect(saved.enabled.orderNumber).toBe(false);
    expect(saved.blockStyles.orderNumber.size).toBe("xlarge");
  });

  it("preserves hidden legacy keys on save", async () => {
    getKitchenTemplate.mockImplementationOnce(() => Promise.resolve({
      template: {
        paperSize: "58mm",
        autoPrint: true,
        blocks: ["orderNumber", "table", "waiter", "createdAt", "items", "orderNote", "priority"],
        enabled: { orderNumber: true, table: true, waiter: true, createdAt: true, items: true, orderNote: true, priority: true },
      },
      source: "api",
    }));
    render(<ChefReceiptSettingsPage />);
    await screen.findByRole("heading", { name: "Настройка чека повара" });
    // Legacy createdAt maps to the visible Дата row.
    expect(screen.getByRole("checkbox", { name: "Дата" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(saveKitchenTemplate).toHaveBeenCalledTimes(1));
    const saved = saveKitchenTemplate.mock.calls[0][0];
    expect(saved.paperSize).toBe("58mm");
    expect(saved.autoPrint).toBe(true);
    expect(saved.enabled.priority).toBe(true);
    expect(saved.enabled.createdAt).toBe(true);
    expect(saved.blocks).toContain("date");
    expect(saved.blocks).toContain("comment");
    expect(saved.blockStyles.orderNumber).toMatchObject({ size: "large", align: "center", weight: "bold" });
  });

  it("normalizes a stored legacy medium size to large on load and save", async () => {
    getKitchenTemplate.mockImplementationOnce(() => Promise.resolve({
      template: {
        blocks: [...KITCHEN_BLOCKS],
        enabled: { orderNumber: true },
        blockStyles: { orderNumber: { size: "medium", align: "center", weight: "bold" } },
      },
      source: "api",
    }));
    const { container } = render(<ChefReceiptSettingsPage />);
    await screen.findByRole("heading", { name: "Настройка чека повара" });
    // UI shows Большой selected, no broken empty state.
    const row = container.querySelector('[data-block-row="orderNumber"]');
    expect(row.querySelector(".receipt-segments button.is-active").textContent).toBe("Большой");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(saveKitchenTemplate).toHaveBeenCalledTimes(1));
    expect(saveKitchenTemplate.mock.calls[0][0].blockStyles.orderNumber.size).toBe("large");
  });

  it("renders the kitchen preview (no customer pricing) and blocks", async () => {
    const { container } = render(<ChefReceiptSettingsPage />);
    await screen.findByRole("heading", { name: "Настройка чека повара" });
    expect(container.querySelector("[data-receipt-type='kitchen']")).not.toBeNull();
    // Kitchen omits customer money blocks.
    expect(screen.queryByText("ИТОГО:")).toBeNull();
    // The sample order carries a type, so the preview shows the same
    // «Тип заказа» line the physical ticket prints.
    expect(screen.getByText("Тип заказа:")).toBeInTheDocument();
    expect(screen.getByText("На стол")).toBeInTheDocument();
  });

  it("stages style changes as a local draft (no instant PATCH)", async () => {
    render(<ChefReceiptSettingsPage />);
    await screen.findByRole("heading", { name: "Настройка чека повара" });
    fireEvent.click(screen.getAllByRole("button", { name: "Вправо" })[0]);
    expect(saveKitchenTemplate).not.toHaveBeenCalled();
  });

  it("saves via one PATCH and shows a saved banner", async () => {
    render(<ChefReceiptSettingsPage />);
    await screen.findByRole("heading", { name: "Настройка чека повара" });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(saveKitchenTemplate).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Шаблон кухонного чека сохранён на сервере/)).toBeInTheDocument();
  });

  it("shows a save error without faking success", async () => {
    saveKitchenTemplate.mockRejectedValueOnce(
      Object.assign(new Error("boom"), { response: { data: { detail: "Сервис недоступен" } } }),
    );
    render(<ChefReceiptSettingsPage />);
    await screen.findByRole("heading", { name: "Настройка чека повара" });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Сервис недоступен")).toBeInTheDocument();
    expect(screen.queryByText(/сохранён на сервере/)).toBeNull();
  });
});

describe("migrateKitchenTemplate", () => {
  it("builds the 7-row model with showOrderSum ON by default", () => {
    const tpl = migrateKitchenTemplate({}, buildKitchenTemplate());
    expect(tpl.blocks).toEqual([
      "orderNumber", "orderType", "table",
      "waiter", "date", "showOrderSum", "comment",
    ]);
    expect(tpl.enabled.showOrderSum).toBe(true);
    expect(tpl.enabled.orderNumber).toBe(true);
  });

  it("maps legacy createdAt/itemComments/orderNote into date/comment", () => {
    const tpl = migrateKitchenTemplate(
      { blocks: ["orderNumber"], enabled: { createdAt: false, itemComments: false, orderNote: true } },
      buildKitchenTemplate(),
    );
    expect(tpl.enabled.date).toBe(false);
    expect(tpl.enabled.comment).toBe(true);
    expect(tpl.blocks).toContain("date");
  });

  it("drops the removed cancelOrderNumber block from a stored template", () => {
    const tpl = migrateKitchenTemplate(
      {
        blocks: ["orderNumber", "cancelOrderNumber", "orderType", "table"],
        enabled: { cancelOrderNumber: true, orderNumber: true },
      },
      buildKitchenTemplate(),
    );
    expect(tpl.blocks).not.toContain("cancelOrderNumber");
    expect(tpl.blocks).toContain("orderNumber");
    expect(tpl.blocks).toContain("orderType");
  });

  it("purges the retired date alignment so the hidden style never applies", () => {
    const tpl = migrateKitchenTemplate(
      { blockStyles: { date: { size: "large", align: "center", weight: "bold" } } },
      buildKitchenTemplate(),
    );
    expect(tpl.blockStyles.date.align).toBeUndefined();
    expect(tpl.blockStyles.date).toMatchObject({ size: "large", weight: "bold" });
  });

  it("keeps unknown and legacy keys intact", () => {
    const tpl = migrateKitchenTemplate(
      { customField: "keep", enabled: { priority: true, items: true } },
      buildKitchenTemplate(),
    );
    expect(tpl.customField).toBe("keep");
    expect(tpl.enabled.priority).toBe(true);
    expect(tpl.enabled.items).toBe(true);
  });
});
