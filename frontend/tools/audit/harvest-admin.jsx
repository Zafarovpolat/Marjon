/**
 * Сборщик DOM админки: рендерит AdminApp, прокликивает всю навигацию и
 * сохраняет разметку каждого раздела в .cssaudit/domadmin/*.html.
 *
 * Инструмент аудита, не продуктовый тест.
 */
import { render, act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.cwd(), ".cssaudit/domadmin");

const state = vi.hoisted(() => ({ authed: false }));
const adminApi = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve({ data: [] })),
  post: vi.fn(() => Promise.resolve({ data: {} })),
  patch: vi.fn(() => Promise.resolve({ data: {} })),
  put: vi.fn(() => Promise.resolve({ data: {} })),
  delete: vi.fn(() => Promise.resolve({ data: {} })),
  defaults: { headers: { common: {} } },
  interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
}));

vi.mock("../../src/admin/api", () => ({
  ADMIN_API_BASE_URL: "http://127.0.0.1:8000/api/v1",
  adminApi,
  default: adminApi,
  adminLogin: vi.fn(() => Promise.resolve({ ok: true })),
  adminLogout: vi.fn(),
  isAdminAuthenticated: () => state.authed,
  // FE-08A: AdminApp теперь валидирует сессию через getValidatedAdminProfile.
  // Фикстура возвращает валидный HQ-профиль, иначе оболочка уходит в LoginView.
  getValidatedAdminProfile: vi.fn(() => Promise.resolve({
    id: "a1",
    email: "admin@marjon.uz",
    full_name: "Админ",
    is_superadmin: true,
    auth_scope: "hq_admin",
  })),
}));

/** Разделы навигации: сначала родители (раскрыть), затем дети. */
const GROUPS = [
  ["Дашборд", []],
  ["Организации", ["Организация", "Статус организации"]],
  ["Склад", ["Приход товаров", "Расход товаров", "Остаток", "Журнал приходов", "Отход товаров", "Инвентаризация"]],
  ["Номенклатура", ["Продукт", "Категория реализации", "Заказы", "Единица измерения"]],
  ["Справочник", ["Страны", "Регионы", "Районы"]],
  ["Услуга", ["Сотрудники", "Источник"]],
  ["Банк", ["Статистика банка", "Транзакции банка"]],
  ["Финансы", ["Денежные операции", "Категория приходов", "Категория расходов", "Способ оплаты", "История изменений"]],
  ["Настройки", ["Marjon store", "Фон для кассира", "Языки"]],
];

const slug = (s) => s.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-").replace(/^-|-$/g, "");

describe("harvest admin dom", () => {
  beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true });
    HTMLCanvasElement.prototype.getContext = () => ({
      canvas: { width: 300, height: 150 },
      clearRect() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {},
      stroke() {}, save() {}, restore() {}, translate() {}, rotate() {},
      measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop() {} }),
      setTransform() {}, scale() {}, moveTo() {}, lineTo() {}, closePath() {},
      fillText() {}, strokeText() {}, drawImage() {}, putImageData() {},
      getImageData: () => ({ data: [] }), createPattern: () => null, rect() {}, clip() {},
    });
    window.matchMedia = window.matchMedia || ((q) => ({
      matches: false, media: q, onchange: null,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
      dispatchEvent() { return false; },
    }));
  });

  beforeEach(() => {
    localStorage.clear();
    state.authed = false;
  });

  it("логин админки", async () => {
    const { default: AdminApp } = await import("../../src/admin/AdminApp.jsx");
    const { container } = render(<AdminApp />);
    await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
    fs.writeFileSync(path.join(OUT, "admin-login.html"), container.innerHTML, "utf8");
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("все разделы админки", async () => {
    state.authed = true;
    localStorage.setItem("marjon_admin_token", "test-token");
    localStorage.setItem("marjon_admin_user", JSON.stringify({ id: "a1", email: "admin@marjon.uz", full_name: "Админ" }));
    const { default: AdminApp } = await import("../../src/admin/AdminApp.jsx");
    const { container } = render(<AdminApp />);
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });

    fs.writeFileSync(path.join(OUT, "admin-shell.html"), container.innerHTML, "utf8");

    let saved = 1;
    for (const [group, children] of GROUPS) {
      // раскрыть группу / открыть раздел
      const hit = screen.queryAllByText(group)[0];
      if (hit) {
        await act(async () => { fireEvent.click(hit.closest("button") || hit); await new Promise((r) => setTimeout(r, 90)); });
        fs.writeFileSync(path.join(OUT, `sec-${slug(group)}.html`), container.innerHTML, "utf8");
        saved++;
      }
      for (const child of children) {
        const c = screen.queryAllByText(child)[0];
        if (!c) continue;
        await act(async () => { fireEvent.click(c.closest("button") || c); await new Promise((r) => setTimeout(r, 90)); });
        fs.writeFileSync(path.join(OUT, `sec-${slug(child)}.html`), container.innerHTML, "utf8");
        saved++;
      }
    }
    // eslint-disable-next-line no-console
    console.log(`сохранено разделов: ${saved}`);
    expect(saved).toBeGreaterThan(10);
  }, 120000);

  // FE-08D-HQ: расширение визуального оракула HQ. Снимаем class-driven
  // интерактивные состояния (свёрнутый сайдбар, раскрытое подменю, флайаут
  // свёрнутой группы) — именно на них сосредоточены override-правила
  // admin/styles.css. Состояния переключают реальные классы (is-sidebar-collapsed
  // / is-open), которые движок каскада видит (в отличие от чистого :hover).
  // Детерминизм: 1500мс осадка, как в OWNER-состояниях (FE-08A).
  it("HQ интерактивные состояния", async () => {
    state.authed = true;
    localStorage.setItem("marjon_admin_token", "test-token");
    localStorage.setItem("marjon_admin_user", JSON.stringify({ id: "a1", email: "admin@marjon.uz", full_name: "Админ" }));
    const { default: AdminApp } = await import("../../src/admin/AdminApp.jsx");

    const settle = async (ms = 1500) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };

    // 1) Раскрытое подменю (класс is-open на группе).
    {
      const { container } = render(<AdminApp />);
      await settle(200);
      const grp = screen.queryAllByText("Финансы")[0];
      if (grp) await act(async () => { fireEvent.click(grp.closest("button") || grp); await new Promise((r) => setTimeout(r, 90)); });
      await settle();
      fs.writeFileSync(path.join(OUT, "state-admin-submenu-open.html"), container.innerHTML, "utf8");
      expect(container.innerHTML).toMatch(/admin-shell/);
    }

    // 2) Свёрнутый сайдбар (класс is-sidebar-collapsed на оболочке).
    {
      const { container } = render(<AdminApp />);
      await settle(200);
      const collapse = container.querySelector('[aria-label="Свернуть меню"], [title="Свернуть меню"], .brand-mark--button');
      if (collapse) await act(async () => { fireEvent.click(collapse); await new Promise((r) => setTimeout(r, 90)); });
      await settle();
      fs.writeFileSync(path.join(OUT, "state-admin-sidebar-collapsed.html"), container.innerHTML, "utf8");
      expect(container.innerHTML).toMatch(/admin-shell/);
    }

    // 3) Открытое меню уведомлений (класс is-open на колокольчике / дропдауне).
    //    Заменяет прежнее collapsed-flyout: флайаут open-state (has-popover)
    //    hover-driven и ненадёжно воспроизводится в jsdom, а его базовая разметка
    //    (.admin-nav-flyout) уже попадает в state-admin-sidebar-collapsed. Меню
    //    уведомлений — реальный class-driven (is-open) оверлей, видимый движку.
    {
      const { container } = render(<AdminApp />);
      await settle(200);
      const bell = container.querySelector(".admin-notification, .admin-bell");
      if (bell) await act(async () => { fireEvent.click(bell); await new Promise((r) => setTimeout(r, 90)); });
      await settle();
      fs.writeFileSync(path.join(OUT, "state-admin-notifications-open.html"), container.innerHTML, "utf8");
      expect(container.innerHTML).toMatch(/admin-shell/);
    }
  }, 120000);
});
