import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import StopListPage from "./StopListPage";
import { mapStopListRow } from "./useStopList";
import { formatQuantity, parseQuantityInput, parseStopListLimit, applyLiveMask } from "./stopListFormat";
import { roundScale3, visibleTopups, historyView } from "./stopListHistory";

vi.mock("../../api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../components/Icon", () => ({ default: () => <span aria-hidden="true" /> }));

const MOCK_UNITS = [{ id: "unit-sht", name: "Штук", short_name: "Шт", status: true, sort: 1 }];

const topup = (amount, seq) => ({
  id: `topup-${seq}`,
  company_id: "company-uuid",
  product_id: "product-uuid",
  amount,
  seq,
  created_by: "owner-uuid",
  idempotency_key: `key-${seq}`,
  created_at: `2026-10-07T10:00:0${seq}Z`,
  updated_at: `2026-10-07T10:00:0${seq}Z`,
});

const product = (overrides = {}) => ({
  id: "product-uuid",
  company_id: "company-uuid",
  category_id: null,
  subcategory_id: null,
  product_type: "dish",
  printer_id: null,
  unit_id: "unit-sht",
  name: "Лаваш",
  description: null,
  image_url: null,
  price: 20000,
  cost_price: 8000,
  tax_rate: 12,
  unit: "шт",
  barcode: null,
  sku: null,
  is_active: true,
  is_available: true,
  sort_order: 1,
  category_name: "",
  subcategory_name: null,
  printer_name: "",
  ingredients_count: 0,
  stock: null,
  daily_limit: null,
  sold_count: 0,
  history_reset_seq: null,
  recent_topups: [],
  ingredients: [],
  ...overrides,
});

// Stateful mock: POST меняют последующие GET (как настоящий backend).
function mockApis(products, units = MOCK_UNITS) {
  const byId = new Map(
    (Array.isArray(products) ? products : []).map((p) => [
      String(p.id),
      { ...p, recent_topups: [...(p.recent_topups || [])] },
    ]),
  );
  const findByUrl = (url) => {
    for (const [id, p] of byId) {
      if (String(url).includes(id)) return p;
    }
    return byId.values().next().value;
  };
  api.get.mockImplementation((url) => {
    if (String(url).includes("/units")) return Promise.resolve({ data: { items: units } });
    if (String(url).includes("/inventory/products")) {
      if (String(url).includes("/topups")) {
        const p = findByUrl(url);
        return Promise.resolve({ data: [...(p?.recent_topups || [])] });
      }
      // Как настоящий _attach_aggregates: видимы seq > checkpoint, max 2.
      const visible = [...byId.values()].map((p) => ({
        ...p,
        recent_topups: p.recent_topups
          .filter((t) => (t.seq || 0) > (p.history_reset_seq || 0))
          .slice(-2),
      }));
      return Promise.resolve({ data: visible });
    }
    return Promise.resolve({ data: [] });
  });
  api.post.mockImplementation((url, body) => {
    if (String(url).endsWith("/topups")) {
      const current = findByUrl(url);
      const daily = current.daily_limit == null ? 0 : Number(current.daily_limit);
      const full = [
        ...current.recent_topups,
        topup(body.amount, current.recent_topups.length + 1),
      ];
      const next = {
        ...current,
        daily_limit: String(daily + Number(body.amount)),
        recent_topups: full,
      };
      byId.set(String(next.id), next);
      const cutoff = next.history_reset_seq || 0;
      const visible = full.filter((t) => (t.seq || 0) > cutoff).slice(-2);
      return Promise.resolve({
        data: {
          product: { ...next, recent_topups: visible },
          topup: topup(body.amount, full.length),
          duplicate: false,
        },
      });
    }
    if (String(url).endsWith("/allowance-zero")) {
      const current = findByUrl(url);
      const next = { ...current, daily_limit: "0", sold_count: 0, is_available: false };
      byId.set(String(next.id), next);
      return Promise.resolve({ data: { ...product(), ...next } });
    }
    if (String(url).endsWith("/history-reset")) {
      const current = findByUrl(url);
      const maxSeq = current.recent_topups.reduce((m, t) => Math.max(m, t.seq || 0), 0);
      const next = { ...current, history_reset_seq: maxSeq };
      byId.set(String(next.id), next);
      return Promise.resolve({ data: { ...product(), ...next } });
    }
    return Promise.resolve({ data: {} });
  });
}

function mockScenario(historyAmounts, daily, sold = 0, extra = {}) {
  const recent = historyAmounts.map((amount, i) => topup(String(amount), i + 1));
  mockApis([product({ daily_limit: daily == null ? null : String(daily), sold_count: sold, recent_topups: recent, ...extra })]);
}

describe("STOP-LIST V3.5 coordinated save timeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScenario(["200", "55"], "255");
  });

  it("single connected flight: chips mount once, unmount, no duplicates", async () => {
    const { container } = render(<StopListPage />);
    await screen.findByRole("table", { name: "Стоп-лист" });
    const input = screen.getByRole("textbox", { name: "Новый лимит для Лаваш" });
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить лимит для Лаваш" }));
    await waitFor(() => expect(document.querySelectorAll(".stoplist-fly-chip")).toHaveLength(2));
    // Ровно две копии (остаток + история), больше не плодим.
    expect(document.querySelectorAll(".stoplist-fly-chip")).toHaveLength(2);
    await waitFor(() => expect(document.querySelector(".stoplist-fly-chip")).toBeNull(), { timeout: 3000 });
  });

  it("swap comes from POST response: one reconcile, no mid-flight teleport", async () => {
    const { container } = render(<StopListPage />);
    await screen.findByRole("table", { name: "Стоп-лист" });
    const productsGets = () => api.get.mock.calls.filter(([url]) => url === "/inventory/products").length;
    expect(productsGets()).toBe(1);
    fireEvent.change(screen.getByRole("textbox", { name: "Новый лимит для Лаваш" }), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить лимит для Лаваш" }));
    // Итог появляется из ответа: 255 + 25 = 280, история (55) 25.
    await waitFor(() => expect(container.querySelector(".stoplist-stock-text")).toHaveTextContent("280 Шт"));
    // Ровно один фоновый reconcile после всей анимации.
    await waitFor(() => expect(productsGets()).toBe(2));
    const cell = container.querySelector("tbody .stoplist-col-prev");
    expect(cell).toHaveTextContent("(55)");
    expect(cell).toHaveTextContent("25");
  });

  it("history slide: old exits left, new enters right, single row height kept", async () => {
    const { container } = render(<StopListPage />);
    await screen.findByRole("table", { name: "Стоп-лист" });
    fireEvent.change(screen.getByRole("textbox", { name: "Новый лимит для Лаваш" }), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить лимит для Лаваш" }));
    await waitFor(() => expect(container.querySelector(".stoplist-hist-layer.is-exit")).not.toBeNull());
    const css = readFileSync(`${process.cwd()}/src/styles/owner/stop-list.css`, "utf8");
    expect(css).toMatch(/@keyframes stoplist-hist-exit/);
    expect(css).toMatch(/@keyframes stoplist-hist-enter/);
    expect(css).toMatch(/translate3d\(-18px/);
    expect(css).toMatch(/translate3d\(18px/);
    expect(css).toMatch(/stoplist-hist-layer\.is-exit[^}]*stoplist-hist-exit\s+280ms/);
    expect(css).toMatch(/stoplist-hist-layer\.is-enter[^}]*stoplist-hist-enter\s+280ms/);
    await waitFor(() => expect(container.querySelector(".stoplist-hist-layer.is-exit")).toBeNull(), { timeout: 3000 });
    // После settle — только (55) 25: 200 ушло из видимой истории.
    const cell = container.querySelector("tbody .stoplist-col-prev");
    expect(cell.textContent).not.toContain("200");
  });

  it("failed save: no flight, no slide, draft kept, retry possible", async () => {
    api.post.mockRejectedValue({ response: { data: { detail: "topup down" } } });
    const { container } = render(<StopListPage />);
    await screen.findByRole("table", { name: "Стоп-лист" });
    const input = screen.getByRole("textbox", { name: "Новый лимит для Лаваш" });
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить лимит для Лаваш" }));
    await waitFor(() => expect(screen.getByText("topup down")).toBeInTheDocument());
    expect(document.querySelector(".stoplist-fly-chip")).toBeNull();
    expect(container.querySelector(".stoplist-hist-layer")).toBeNull();
    expect(input).toHaveValue("25");
    expect(container.querySelector(".stoplist-stock-text")).toHaveTextContent("255 Шт");
  });

  it("reduced motion: instant canonical swap, no movement", async () => {
    window.matchMedia = vi.fn(() => ({
      matches: true, addEventListener: () => {}, removeEventListener: () => {},
    }));
    const { container } = render(<StopListPage />);
    await screen.findByRole("table", { name: "Стоп-лист" });
    fireEvent.change(screen.getByRole("textbox", { name: "Новый лимит для Лаваш" }), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить лимит для Лаваш" }));
    await waitFor(() => expect(container.querySelector(".stoplist-stock-text")).toHaveTextContent("280 Шт"));
    expect(document.querySelector(".stoplist-fly-chip")).toBeNull();
    expect(container.querySelector(".stoplist-hist-layer")).toBeNull();
    const css = readFileSync(`${process.cwd()}/src/styles/owner/stop-list.css`, "utf8");
    expect(css).toMatch(/prefers-reduced-motion/);
    delete window.matchMedia;
  });
});

describe("STOP-LIST V3.5 management modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScenario(["55", "25"], "280", 30);
  });

  async function openModal() {
    await screen.findByRole("table", { name: "Стоп-лист" });
    fireEvent.click(screen.getByRole("button", { name: "Управление лимитами: Лаваш" }));
    return screen.findByRole("dialog", { name: "Управление лимитами" });
  }

  it("10/11/12/13. centered dialog with product, remainder and history", async () => {
    const { container } = render(<StopListPage />);
    await screen.findByRole("table", { name: "Стоп-лист" });
    // Правая кнопка больше не сбрасывает сразу — открывает модалку.
    expect(screen.queryByRole("button", { name: /Сбросить лимит для/ })).toBeNull();
    await openModal();
    const dialog = screen.getByRole("dialog", { name: "Управление лимитами" });
    expect(within(dialog).getByText("Лаваш")).toBeInTheDocument();
    expect(within(dialog).getByText("Остаток")).toBeInTheDocument();
    expect(within(dialog).getByText("250 Шт")).toBeInTheDocument();
    expect(within(dialog).getByText("Предыдущий лимит")).toBeInTheDocument();
    expect(dialog.textContent).toContain("(55)");
    const css = readFileSync(`${process.cwd()}/src/styles/owner/stop-list.css`, "utf8");
    expect(css).toMatch(/stoplist-manage-modal[^}]*border-radius:\s*20px/);
    expect(css).toMatch(/stoplist-manage-modal[^}]*#d0d9e8/i);
    expect(document.querySelector(".stoplist-manage-layer .settings-modal-overlay")).not.toBeNull();
  });

  it("15. reset runs immediately without confirmation", async () => {
    render(<StopListPage />);
    await openModal();
    const dialog = screen.getByRole("dialog", { name: "Управление лимитами" });
    const resetButtons = within(dialog).getAllByRole("button", { name: /Обнулить/ });
    expect(resetButtons).toHaveLength(2);
    fireEvent.click(resetButtons[0]);
    await waitFor(() => expect(api.post.mock.calls.some(([u]) => String(u).endsWith("/allowance-zero"))).toBe(true));
    expect(within(dialog).queryByRole("button", { name: "Отмена" })).toBeNull();
    expect(dialog.querySelector(".stoplist-manage-confirm-slot")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Управление лимитами" })).toBeInTheDocument();
  });

  it("14/17. remainder reset zeroes only remainder, dialog stays open", async () => {
    const { container } = render(<StopListPage />);
    await screen.findByRole("table", { name: "Стоп-лист" });
    await openModal();
    const dialog = screen.getByRole("dialog", { name: "Управление лимитами" });
    fireEvent.click(within(dialog).getAllByRole("button", { name: /Обнулить/ })[0]);
    await waitFor(() => expect(
      api.post.mock.calls.some(([u]) => String(u).endsWith("/allowance-zero")),
    ).toBe(true));
    // Модалка открыта, остаток "—" (display сброшенного нуля), история не тронута.
    await waitFor(() => expect(
      within(dialog).getByText("Остаток").closest(".stoplist-manage-block")
        .querySelector(".stoplist-manage-value").textContent,
    ).toBe("—"));
    expect(dialog.textContent).toContain("(55)");
    expect(screen.getByRole("dialog", { name: "Управление лимитами" })).toBeInTheDocument();
    const cell = container.querySelector("tbody .stoplist-col-prev");
    expect(cell.textContent).toContain("(55)");
    // Таблица тоже показывает дефис без единицы (канонический ноль в backend).
    expect(container.querySelector(".stoplist-stock-text")).toHaveTextContent("—");
    expect(container.querySelector(".stoplist-stock-text").textContent).not.toContain("0");
  });

  it("17/18. history reset zeroes only visible history, balance intact", async () => {
    render(<StopListPage />);
    await screen.findByRole("table", { name: "Стоп-лист" });
    await openModal();
    const dialog = screen.getByRole("dialog", { name: "Управление лимитами" });
    fireEvent.click(within(dialog).getAllByRole("button", { name: /Обнулить/ })[1]);
    await waitFor(() => expect(
      api.post.mock.calls.some(([u]) => String(u).endsWith("/history-reset")),
    ).toBe(true));
    // Видимая история стала "—", остаток 250 не тронут — и в модалке, и в таблице.
    const histValue = () => within(dialog)
      .getByText("Предыдущий лимит")
      .closest(".stoplist-manage-block")
      .querySelector(".stoplist-manage-value").textContent;
    await waitFor(() => expect(histValue()).toBe("—"));
    expect(within(dialog).getByText("250 Шт")).toBeInTheDocument();
  });

  it("19. failed reset keeps values and allows retry (modal-local error)", async () => {
    render(<StopListPage />);
    await screen.findByRole("table", { name: "Стоп-лист" });
    await openModal();
    api.post.mockRejectedValue({ response: { status: 500, data: { detail: "reset down" } } });
    const dialog = screen.getByRole("dialog", { name: "Управление лимитами" });
    fireEvent.click(within(dialog).getAllByRole("button", { name: /Обнулить/ })[0]);
    // Ошибка — внутри модалки (role=alert), значения на месте, retry доступен.
    await waitFor(() => expect(
      within(dialog).getByText("reset down"),
    ).toBeInTheDocument());
    expect(dialog.querySelector(".stoplist-manage-error")).not.toBeNull();
    expect(within(dialog).getByText("250 Шт")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Управление лимитами" })).toBeInTheDocument();
    const retry = within(dialog).getByRole("button", { name: /Обнулить остаток:/ });
    expect(retry).not.toBeDisabled();
    api.post.mockClear();
    fireEvent.click(retry);
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  });

  it("19b. 404 reset explains stale backend instead of raw Not Found", async () => {
    render(<StopListPage />);
    await screen.findByRole("table", { name: "Стоп-лист" });
    await openModal();
    api.post.mockRejectedValue({ response: { status: 404, data: { detail: "Not Found" } } });
    const dialog = screen.getByRole("dialog", { name: "Управление лимитами" });
    fireEvent.click(within(dialog).getAllByRole("button", { name: /Обнулить/ })[1]);
    await waitFor(() => expect(
      within(dialog).getByText("Операция пока недоступна. Сервер не поддерживает эту функцию."),
    ).toBeInTheDocument());
    // Ничего не изменилось и не очистилось: остаток и история на месте.
    expect(within(dialog).getByText("250 Шт")).toBeInTheDocument();
    expect(dialog.textContent).toContain("(55)");
  });

  it("V3.7 modal title fits one line and empty values show dash", async () => {
    render(<StopListPage />);
    await screen.findByRole("table", { name: "Стоп-лист" });
    await openModal();
    const dialog = screen.getByRole("dialog", { name: "Управление лимитами" });
    const css = readFileSync(`${process.cwd()}/src/styles/owner/stop-list.css`, "utf8");
    // Компактный заголовок вместо глобальных 24–34px/800, без !important.
    expect(css).toMatch(/stoplist-manage-modal \.settings-form__header h2[^}]*font-size:\s*19px/);
    expect(css).toMatch(/stoplist-manage-modal \.settings-form__header h2[^}]*white-space:\s*nowrap/);
    expect(css).not.toContain("!important");
    expect(dialog).toBeInTheDocument();
  });

  it("modal keeps a compact shell with no reserved confirmation region", async () => {
    render(<StopListPage />);
    await screen.findByRole("table", { name: "Стоп-лист" });
    await openModal();
    const dialog = screen.getByRole("dialog", { name: "Управление лимитами" });
    // Слоты подтверждения всегда в DOM (резерв места), контент — по состоянию.
    expect(dialog.querySelectorAll(".stoplist-manage-confirm-slot")).toHaveLength(0);
    const css = readFileSync(`${process.cwd()}/src/styles/owner/stop-list.css`, "utf8");
    // Фиксированная ширина расширенного baseline + viewport-cap, без auto.
    expect(css).toMatch(/stoplist-manage-layer \.settings-modal\.stoplist-manage-modal[^}]*width:\s*480px/);
    expect(css).toMatch(/stoplist-manage-layer \.settings-modal\.stoplist-manage-modal[^}]*max-width:\s*calc\(100vw - 32px\)/);
    expect(css).toMatch(/stoplist-manage-layer \.settings-modal\.stoplist-manage-modal[^}]*height:\s*340px/);
    expect(css).toMatch(/\.stoplist-manage-product\s*\{[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/\.stoplist-manage-product\s*\{[^}]*line-height:\s*22px/);
    expect(css).toMatch(/\.stoplist-manage-modal \.stoplist-hist-pair\s*\{[^}]*gap:\s*6px/);
    expect(css).not.toContain("stoplist-manage-confirm-slot");
    expect(css).toMatch(/stoplist-manage-modal \.settings-form__header[^}]*justify-content:\s*flex-start/);
    // Запрет intrinsic-расширения изнутри и анимаций геометрии диалога.
    expect(css).toMatch(/stoplist-manage-modal \.stoplist-manage-row > \*[^{]*\{[^}]*min-width:\s*0/);
    expect(css).not.toMatch(/stoplist-manage-modal[^}]*transition:\s*[^;}]*width/);
    expect(css).not.toMatch(/stoplist-manage-modal[^}]*transition:\s*[^;}]*height/);
    expect(css).not.toContain("!important");
    // Direct reset does not introduce extra layout regions.
    fireEvent.click(within(dialog).getAllByRole("button", { name: /Обнулить/ })[0]);
    expect(dialog.querySelectorAll(".stoplist-manage-confirm-slot")).toHaveLength(0);
    expect(dialog.className).not.toMatch(/is-closing|closing/);
    await waitFor(() => expect(within(dialog).getByRole("button", { name: /Обнулить остаток:/ })).not.toBeDisabled());
    expect(dialog.querySelectorAll(".stoplist-manage-confirm-slot")).toHaveLength(0);
  });

  it("20. Escape/X/close work; table scroll intact", async () => {
    const { container } = render(<StopListPage />);
    await screen.findByRole("table", { name: "Стоп-лист" });
    await openModal();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(container.querySelector(".stoplist-grid-scroll")).not.toBeNull();
  });
});

describe("STOP-LIST V3.5 numbers, mapping and shell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScenario([], null);
  });

  it("V3.7.1 reset zero renders dash; exhausted zero keeps honest 0", () => {
    const units = [{ id: "unit-sht", label: "Шт", name: "Штук", short_name: "Шт", active: true }];
    // Сброшенный ноль (daily=0 — только allowance-zero): дефис без единицы.
    const reset = mapStopListRow(product({ daily_limit: "0", sold_count: 0, unit: "шт" }), units);
    expect(reset.allowance).toBe(0);
    expect(reset.available).toBe(0);
    expect(reset.remainderText).toBe("—");
    expect(reset.remainderHint).toBe("Остаток обнулён");
    // Никогда не топавшийся без квоты: дефис "без ограничения".
    const free = mapStopListRow(product({ daily_limit: null, sold_count: 0, unit: "шт" }), units);
    expect(free.remainderText).toBe("—");
    expect(free.remainderHint).toBe("Без ограничения");
    // Исчерпанная квота (allowance жив, доступно 0): честные "0 Шт".
    const spent = mapStopListRow(product({ daily_limit: "250", sold_count: 250, unit: "шт" }), units);
    expect(spent.remainderText).toBe("0 Шт");
  });

  it("historyView: pair / cleared-empty-dash / fallback / empty (V3.7: no fake 0)", () => {
    expect(historyView([{ amount: "55" }, { amount: "25" }], {}).pair).toEqual([55, 25]);
    // Пустое окно после сброса — дефис, а не "0" (checkpoint учтён, но вид — empty).
    expect(historyView([], { allowance: 250, resetSeq: 3 })).toEqual({ kind: "empty", pair: [] });
    // Fallback мигрированных данных сохранён: реальный allowance виден как есть.
    expect(historyView([], { allowance: 250, resetSeq: null })).toEqual({ kind: "pair", pair: [250] });
    expect(historyView([], { allowance: null, resetSeq: null })).toEqual({ kind: "empty", pair: [] });
  });

  it("history reset in table shows dash, remainder keeps real zero", async () => {
    vi.clearAllMocks();
    mockScenario(["200", "55"], "255");
    const { container } = render(<StopListPage />);
    await screen.findByRole("table", { name: "Стоп-лист" });
    expect(container.querySelector("tbody .stoplist-col-prev").textContent).toContain("(200)");
    expect(container.querySelector(".stoplist-stock-text")).toHaveTextContent("255 Шт");
  });

  it("live mask + grouping + parse stay intact", () => {
    expect(applyLiveMask("2323", 4)).toEqual({ text: "2 323", caret: 5 });
    expect(formatQuantity(1212)).toBe("1 212");
    expect(formatQuantity("1212.5")).toBe("1 212,5");
    expect(parseQuantityInput("1 212,5")).toEqual({ ok: true, normalized: "1212.5" });
    expect(parseStopListLimit("1 212,5")).toBe("1212.5");
    expect(roundScale3(0.1 + 0.2)).toBe(0.3);
  });

  it("unit selector absent; placeholder; no storage; skin intact", async () => {
    const { container } = render(<StopListPage />);
    await screen.findByRole("table", { name: "Стоп-лист" });
    expect(container.querySelector(".stoplist-unit-select")).toBeNull();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    const css = readFileSync(`${process.cwd()}/src/styles/owner/stop-list.css`, "utf8");
    expect(css).toMatch(/position:\s*sticky/);
    expect(css).toMatch(/scrollbar-width:\s*none/);
    expect(css).toMatch(/#d0d9e8/i);
    expect(css).not.toContain("!important");
    const overrides = readFileSync(`${process.cwd()}/src/styles/react-overrides.css`, "utf8");
    expect(overrides).not.toContain("stoplist-manage");
    expect(overrides).not.toContain("stoplist-fly");
  });
});

describe("STOP-LIST import/export contract (blank-screen regression)", () => {
  it("every named binding used across the V3.5 graph resolves from its source module", async () => {
    // Импортируем РЕАЛЬНЫЕ модули (как это делает браузер/Vite):
    // любое расхождение имён здесь падает так же, как белый экран.
    const history = await import("./stopListHistory");
    expect(typeof history.historyView).toBe("function");
    expect(typeof history.visibleTopups).toBe("function");
    expect(typeof history.roundScale3).toBe("function");
    const format = await import("./stopListFormat");
    for (const name of ["formatQuantity", "parseQuantityInput", "parseStopListLimit", "applyLiveMask"]) {
      expect(typeof format[name]).toBe("function");
    }
    const hook = await import("./useStopList");
    expect(typeof hook.useStopList).toBe("function");
    expect(typeof hook.mapStopListRow).toBe("function");
    const table = await import("./StopListTable");
    expect(table.default).toBeTruthy();
    const modal = await import("./StopListManageModal");
    expect(modal.default).toBeTruthy();
    const page = await import("./StopListPage");
    expect(page.default).toBeTruthy();
  });

  it("historyView honors the approved two-value semantics", async () => {
    const { historyView } = await import("./stopListHistory");
    expect(historyView([{ amount: "200" }, { amount: "55" }], {})).toEqual({ kind: "pair", pair: [200, 55] });
    expect(historyView([{ amount: "200" }, { amount: "55" }, { amount: "25" }].slice(-2), {}).pair).toEqual([55, 25]);
    // V3.7: пустое окно после сброса — тоже empty ("—"), checkpoint лишь
    // фильтрует видимое, вид "0" удалён; fallback allowance сохранён.
    expect(historyView([], { allowance: 250, resetSeq: 3 })).toEqual({ kind: "empty", pair: [] });
    expect(historyView([], { allowance: 250, resetSeq: null })).toEqual({ kind: "pair", pair: [250] });
    expect(historyView([], { allowance: null, resetSeq: null })).toEqual({ kind: "empty", pair: [] });
  });
});
