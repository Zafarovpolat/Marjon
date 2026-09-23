import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { api } from "../../api/client";
import StaffRolePage from "../StaffRolePage";
import { staffAccessActions, staffAccessModules } from "./staffConstants";

vi.mock("../../api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  formatMoney: (value) => `${value}`,
  formatNumber: (value) => `${value}`,
}));

const managerUser = {
  id: "manager-uuid",
  name: "Manager One",
  email: null,
  phone: "998901234567",
  role_slug: "manager",
  role_slugs: ["manager"],
  is_active: true,
};

const cashierUser = {
  id: "cashier-uuid",
  name: "Cashier One",
  email: "cashier1@marjon.test",
  phone: "998901234567",
  role_slug: "cashier",
  role_slugs: ["cashier"],
  is_active: true,
};

// CASHIER-PARITY-01 (Phase 1) — Cashier matrix contract, extracted from
// current staffAccessModules source truth (count/text/order). Manager and
// Storekeeper must mirror this list exactly. Any divergence fails tests.
const CASHIER_MATRIX_COUNT = 50;
const CASHIER_MATRIX_CONTRACT = [
  "Главная",
  "Склады (Остаток товаров)",
  "Приход товаров",
  "Расход товаров",
  "Журнал приходов",
  "Перемещения",
  "Возврат поставщику",
  "Инвентаризация",
  "Списание",
  "Категории списания",
  "Z-отчет",
  "Отчет по заказам",
  "Отчет по столам",
  "Отчет по официантам",
  "Отчет по блюдам",
  "Отчет по курьерам",
  "Отчет по удаленным блюдам",
  "Дебиторы и Кредиторы",
  "Денежный поток",
  "Кассир",
  "Официант",
  "Моноблок",
  "Повар",
  "Менеджер",
  "Завсклад",
  "Посещаемость",
  "Курьер",
  "Клиенты",
  "Поставщик",
  "Места",
  "Способы оплаты",
  "Ед. измерения",
  "Настройка профиля",
  "Настройка принтеров",
  "Баннеры",
  "Плейлисты",
  "Устройства",
  "Денежные операции",
  "Категории приход-расходов",
  "Блюда",
  "Категории блюда (меню)",
  "Сырьё",
  "Категории сырья",
  "Полуфабрикаты",
  "Категории полуфабрикатов",
  "Категории реализации",
  "Call Center",
  "Брон",
  "Заказы (изменить, удалить)",
  "Заказы (типы)",
];

function matrixLabelsInDialog(dialog) {
  return [...dialog.querySelectorAll(".staff-permission-matrix .staff-access-row")].map(
    (row) => row.querySelector(".staff-access-toggle span")?.textContent,
  );
}

async function waitForExpectPost() {
  await waitFor(() => expect(api.post).toHaveBeenCalled());
}

async function waitForExpectPatch() {
  await waitFor(() => expect(api.patch).toHaveBeenCalled());
}

describe("manager page visual contract (/users/manager) — MANAGER-STOREKEEPER-01", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: [managerUser, cashierUser] });
    api.post.mockResolvedValue({ data: managerUser });
    api.patch.mockResolvedValue({ data: managerUser });
    api.delete.mockResolvedValue({ data: {} });
  });

  it("A. route uses the manager role with isolation and product header", async () => {
    render(<StaffRolePage role="manager" />);
    expect(await screen.findByText("Manager One")).toBeInTheDocument();
    expect(screen.queryByText("Cashier One")).not.toBeInTheDocument();
    expect(screen.getByText("Список сотрудников: Менеджеры")).toBeInTheDocument();
    expect(document.querySelector(".staff-filters")).toBeNull();
    expect(document.querySelector("header.staff-header--cashier")).not.toBeNull();
    expect(document.querySelector(".staff-card--cashier")).not.toBeNull();
  });

  it("B+C. renders exactly 7 headers in order, no access column", async () => {
    render(<StaffRolePage role="manager" />);
    await screen.findByText("Manager One");
    const headers = screen.getAllByRole("columnheader").map((c) => c.textContent);
    expect(headers).toEqual([
      "ID",
      "Фото",
      "ФИО",
      "Номер телефона",
      "Роль",
      "Статус",
      "Действия",
    ]);
    const table = document.querySelector(".staff-table");
    expect(within(table).queryByText("Права доступа")).toBeNull();
    expect(within(table).queryByText("Базовый доступ")).toBeNull();
    expect(within(table).queryByText("Удаление блюд")).toBeNull();
    expect(within(table).queryByText("Показать кассиров")).toBeNull();
    expect(within(table).getByText("Менеджер")).toBeInTheDocument();
    expect(within(table).getByText("manager-uuid")).toBeInTheDocument();
    expect(within(table).getByText("Активен")).toBeInTheDocument();
  });

  it("D. drawer and table contain no HR surface", async () => {
    render(<StaffRolePage role="manager" />);
    await screen.findByText("Manager One");
    const table = document.querySelector(".staff-table");
    expect(table.textContent).not.toMatch(/HR/);
    expect(table.textContent).not.toContain("Кадры");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).not.toMatch(/HR/);
    expect(dialog.textContent).not.toContain("Кадры");
    expect(within(dialog).queryByText("HR")).toBeNull();
    for (const module of staffAccessModules) {
      expect(module.key.toLowerCase()).not.toContain("hr");
      expect(module.label).not.toMatch(/HR/);
      expect(module.label).not.toContain("Кадры");
    }
  });

  it("CASHIER-CONTRACT. cashier drawer locks the exact 50-module source of truth", { timeout: 20000 }, async () => {
    render(<StaffRolePage role="cashier" />);
    await screen.findByText("Cashier One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    expect(matrixLabelsInDialog(dialog)).toEqual(CASHIER_MATRIX_CONTRACT);
    expect(matrixLabelsInDialog(dialog)).toHaveLength(CASHIER_MATRIX_COUNT);
    expect(staffAccessModules.map((m) => m.label)).toEqual(CASHIER_MATRIX_CONTRACT);
  });

  it("PARITY. manager matrix equals Cashier count/text/order, no extras, HR absent", { timeout: 20000 }, async () => {
    render(<StaffRolePage role="manager" />);
    await screen.findByText("Manager One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    const labels = matrixLabelsInDialog(dialog);
    expect(labels).toHaveLength(CASHIER_MATRIX_COUNT);
    expect(labels).toEqual(CASHIER_MATRIX_CONTRACT);
    // Previously-curated subsets are gone: warehouse-flow modules now present…
    for (const label of ["Приход товаров", "Инвентаризация", "Перемещения", "Склады (Остаток товаров)"]) {
      expect(labels).toContain(label);
    }
    // …and cashier-family modules are no longer filtered out.
    for (const label of ["Кассир", "Официант", "Моноблок", "Z-отчет", "Call Center"]) {
      expect(labels).toContain(label);
    }
    expect(dialog.textContent).not.toMatch(/HR/);
  });

  it("E. add/edit use the product drawer shell", { timeout: 20000 }, async () => {
    render(<StaffRolePage role="manager" />);
    await screen.findByText("Manager One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector(".staff-form--cashier")).not.toBeNull();
    expect(dialog.classList.contains("staff-modal--cashier-full")).toBe(true);
    expect(dialog.parentElement).toBe(document.body);
    expect(within(dialog).getByText("Добавить менеджера")).toBeInTheDocument();
    expect(within(dialog).queryByText("Загрузить фото")).toBeNull();
    expect(dialog.querySelector('input[type="file"]')).toBeNull();
    expect(within(dialog).getByText("Имя")).toBeInTheDocument();
    expect(within(dialog).getByText("Номер телефона")).toBeInTheDocument();
    expect(within(dialog).getByText("Пароль")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Имя менеджера")).toBeInTheDocument();
    expect(within(dialog).queryByText("Email")).toBeNull();
    expect(within(dialog).queryByText("IP адрес принтера")).toBeNull();
    expect(dialog.querySelector("select")).toBeNull();
  });

  it("E2. edit drawer uses manager titles and Новый пароль", async () => {
    render(<StaffRolePage role="manager" />);
    await screen.findByText("Manager One");
    fireEvent.click(screen.getByTitle("Edit"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Изменить менеджера")).toBeInTheDocument();
    expect(within(dialog).getByText("Новый пароль")).toBeInTheDocument();
    expect(within(dialog).queryByText("Email")).toBeNull();
  });

  it("E3. primary switches collapse to Статус only", { timeout: 20000 }, async () => {
    render(<StaffRolePage role="manager" />);
    await screen.findByText("Manager One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    const primary = dialog.querySelectorAll(
      ".cashier-permission-switches .staff-permission-switch",
    );
    expect(primary).toHaveLength(1);
    expect(within(dialog).getByText("Статус")).toBeInTheDocument();
    for (const label of [
      "Удаление блюд",
      "Изменить код маркировки",
      "Заказ на вынос за столом",
      "Изменить тип заказа",
      "Может закрыть счёт",
      "Открыть денежный ящик после оплаты",
      "Просмотр закрытых заказов",
      "Главный моноблок",
      "Список кассиров",
      "Принтер повара",
      "Печать отмены заказа",
    ]) {
      expect(within(dialog).queryByRole("button", { name: label })).toBeNull();
    }
  });

  it("F. name required: empty name blocks with inline error, drawer stays open", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<StaffRolePage role="manager" />);
    await screen.findByText("Manager One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(screen.getByPlaceholderText("Пароль"), {
      target: { value: "Manager123" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Добавить" }));
    const alerts = await within(dialog).findAllByRole("alert");
    expect(alerts).toHaveLength(2);
    for (const alert of alerts) {
      expect(alert).toHaveTextContent("Укажите имя и номер телефона менеджера.");
    }
    expect(dialog.querySelector(".staff-field-error")).not.toBeNull();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("G. +998 phone behavior: stable pill prefix and (XX) XXX-XX-XX formatting", async () => {
    const { unmount } = render(<StaffRolePage role="manager" />);
    await screen.findByText("Manager One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    const prefix = dialog.querySelector(".staff-phone-country--pill");
    const input = dialog.querySelector(".staff-phone-field--split input");
    expect(prefix.textContent).toContain("+998");
    fireEvent.change(input, { target: { value: "90123" } });
    expect(input.value).toBe("(90) 123");
    expect(prefix.textContent).toContain("+998");
    fireEvent.change(input, { target: { value: "+998901234567" } });
    expect(input.value).toBe("(90) 123-45-67");
    expect(input.value.includes("+998")).toBe(false);
    unmount();
  });

  it("H. password create required: weak passwords blocked with field error", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<StaffRolePage role="manager" />);
    await screen.findByText("Manager One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(screen.getByPlaceholderText("Имя менеджера"), {
      target: { value: "Manager Two" },
    });
    fireEvent.change(dialog.querySelector(".staff-phone-field input"), {
      target: { value: "+998901112233" },
    });
    fireEvent.change(screen.getByPlaceholderText("Пароль"), {
      target: { value: "short1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Добавить" }));
    const alerts = await within(dialog).findAllByRole("alert");
    expect(alerts).toHaveLength(2);
    for (const alert of alerts) {
      expect(alert).toHaveTextContent("Пароль должен содержать минимум 8 символов, букву и цифру.");
    }
    expect(alertSpy).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("I. password edit optional: empty password omits password key", async () => {
    api.patch.mockResolvedValue({ data: { ...managerUser, name: "Manager Two" } });
    render(<StaffRolePage role="manager" />);
    await screen.findByText("Manager One");
    fireEvent.click(screen.getByTitle("Edit"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(screen.getByPlaceholderText("Имя менеджера"), {
      target: { value: "Manager Two" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    await waitForExpectPatch();
    const [, payload] = api.patch.mock.calls[0];
    expect(payload.password).toBeFalsy();
    expect(payload).toHaveProperty("role_slug", "manager");
    expect(payload.name).toBe("Manager Two");
  });

  it("J. 409 duplicate phone stays inline under phone field, retry works", { timeout: 20000 }, async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    api.post.mockRejectedValueOnce({
      response: { data: { detail: "Phone already registered" } },
    });
    render(<StaffRolePage role="manager" />);
    await screen.findByText("Manager One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(screen.getByPlaceholderText("Имя менеджера"), {
      target: { value: "Manager Two" },
    });
    fireEvent.change(dialog.querySelector(".staff-phone-field input"), {
      target: { value: "+998901112233" },
    });
    fireEvent.change(screen.getByPlaceholderText("Пароль"), {
      target: { value: "Manager123" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Добавить" }));
    const alerts = await within(dialog).findAllByRole("alert");
    expect(alerts).toHaveLength(2);
    for (const alert of alerts) {
      expect(alert).toHaveTextContent("Этот номер уже зарегистрирован");
      expect(alert).toHaveTextContent("Phone already registered");
    }
    expect(dialog.querySelector(".staff-phone-error")).not.toBeNull();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeNull();
    api.post.mockResolvedValue({
      data: { ...managerUser, id: "retry-uuid", name: "Manager Two" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Добавить" }));
    await screen.findByText("Manager Two");
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it("K+L+M. create sends canonical manager payload only", { timeout: 20000 }, async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const created = {
      id: "new-manager-uuid",
      name: "Manager Two",
      email: null,
      phone: "998901112233",
      role_slug: "manager",
      role_slugs: ["manager"],
      is_active: true,
    };
    api.post.mockResolvedValue({ data: created });
    render(<StaffRolePage role="manager" />);
    await screen.findByText("Manager One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(screen.getByPlaceholderText("Имя менеджера"), {
      target: { value: "Manager Two" },
    });
    fireEvent.change(dialog.querySelector(".staff-phone-field input"), {
      target: { value: "+998901112233" },
    });
    fireEvent.change(screen.getByPlaceholderText("Пароль"), {
      target: { value: "Manager123" },
    });
    // Interact with the frontend-only matrix: must never reach the backend.
    fireEvent.click(within(dialog).getByRole("button", { name: "Главная" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Добавить" }));
    await screen.findByText("Manager Two");
    expect(api.post).toHaveBeenCalledWith("/auth/users", {
      password: "Manager123",
      phone: "998901112233",
      role_slug: "manager",
      role_name: "Manager Two",
    });
    const sent = api.post.mock.calls[0][1];
    for (const key of [
      "email",
      "photo",
      "avatar",
      "avatar_url",
      "printerIp",
      "printer_ip",
      "permissions",
      "permission_ids",
      "staffAccess",
      "access",
      "username",
      "login",
      "pin",
    ]) {
      expect(sent).not.toHaveProperty(key);
    }
    expect(alertSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: 2000 });
    expect(localStorage.getItem("marjon_staff")).toBeNull();
    expect(sessionStorage.getItem("marjon_staff")).toBeNull();
  });

  it("N+O. archive via DELETE and restore via PATCH is_active", async () => {
    render(<StaffRolePage role="manager" />);
    await screen.findByText("Manager One");
    fireEvent.click(screen.getByTitle("Archive"));
    await screen.findByText("Manager One");
    expect(api.delete).toHaveBeenCalledWith("/auth/users/manager-uuid");
    fireEvent.click(screen.getByRole("button", { name: "Архивированные" }));
    expect(await screen.findByText("Manager One")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Restore"));
    await screen.findByText("Manager One");
    expect(api.patch).toHaveBeenCalledWith("/auth/users/manager-uuid", {
      is_active: true,
    });
  });

  it("P. empty state spans 7 columns with Reports illustration", async () => {
    api.get.mockResolvedValue({ data: [] });
    render(<StaffRolePage role="manager" />);
    const title = await screen.findByText("Сотрудники не найдены");
    expect(title).toBeInTheDocument();
    const emptyCell = title.closest("td");
    expect(emptyCell.getAttribute("colSpan")).toBe("7");
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
    const table = document.querySelector(".staff-table");
    expect(table.querySelector(".owner-report-empty-image")).not.toBeNull();
    expect(table.classList.contains("staff-table--no-access")).toBe(true);
  });

  it("Q. matrix shows the full Cashier module list (curated subsets removed)", { timeout: 20000 }, async () => {
    render(<StaffRolePage role="manager" />);
    await screen.findByText("Manager One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector(".staff-permission-matrix")).not.toBeNull();
    expect(matrixLabelsInDialog(dialog)).toEqual(CASHIER_MATRIX_CONTRACT);
  });

  it("Q2. matrix toggles are frontend-only: no storage, no payload, honest default after refetch", { timeout: 20000 }, async () => {
    const { unmount } = render(<StaffRolePage role="manager" />);
    await screen.findByText("Manager One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    const homeToggle = within(dialog).getByRole("button", { name: "Главная" });
    expect(homeToggle.classList.contains("is-on")).toBe(false);
    fireEvent.click(homeToggle);
    expect(homeToggle.classList.contains("is-on")).toBe(true);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    unmount();
    // Fresh refetch returns to honest default (no persisted grant).
    render(<StaffRolePage role="manager" />);
    await screen.findByText("Manager One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const fresh = await screen.findByRole("dialog");
    expect(
      within(fresh).getByRole("button", { name: "Главная" }).classList.contains("is-on"),
    ).toBe(false);
  });

  it("avatar: truthful avatar_url wins, default asset otherwise", async () => {
    api.get.mockResolvedValue({
      data: [
        { ...managerUser, id: "photo-uuid", name: "Photo Manager", avatar_url: "https://cdn.example.com/photos/manager.jpg" },
        { ...managerUser, id: "plain-uuid", name: "Plain Manager", avatar_url: null },
      ],
    });
    render(<StaffRolePage role="manager" />);
    await screen.findByText("Photo Manager");
    const table = document.querySelector(".staff-table");
    const real = within(table).getByAltText("Photo Manager");
    expect(real.getAttribute("src")).toContain("manager.jpg");
    const fallback = within(table).getByAltText("Plain Manager");
    expect(fallback.getAttribute("src")).toContain("staff-default-avatar.png");
  });
});

describe("manager secondary action toggles (parity with cashier/waiter matrix) — MANAGER-STOREKEEPER-02", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: [managerUser, cashierUser] });
    api.post.mockResolvedValue({ data: managerUser });
    api.patch.mockResolvedValue({ data: managerUser });
    api.delete.mockResolvedValue({ data: {} });
  });

  async function openAddDialog() {
    render(<StaffRolePage role="manager" />);
    await screen.findByText("Manager One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    return screen.findByRole("dialog");
  }

  it("E. OFF modules render collapsed: no secondary switches visible", { timeout: 20000 }, async () => {
    const dialog = await openAddDialog();
    const matrix = dialog.querySelector(".staff-permission-matrix");
    expect(matrix).not.toBeNull();
    // No role-specific visibility system: same classes as cashier, no modifier.
    expect(matrix.classList.contains("staff-permission-matrix--curated")).toBe(false);
    expect(matrix.querySelectorAll(".staff-access-row")).toHaveLength(CASHIER_MATRIX_COUNT);
    expect(matrix.querySelector(".staff-access-row.is-open")).toBeNull();
    // Hidden rows expose no interactive controls: 200 buttons in DOM, zero visible.
    expect(matrix.querySelectorAll(".staff-access-action")).toHaveLength(CASHIER_MATRIX_COUNT * 4);
    expect(within(dialog).queryByRole("button", { name: "Создать" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Читать" })).toBeNull();
    // Only one module expands at a time below; the rest stay collapsed here.
  });

  it("F. representative module hides/shows secondary actions on OFF/ON", { timeout: 20000 }, async () => {
    const dialog = await openAddDialog();
    const primary = within(dialog).getByRole("button", { name: "Отчет по заказам" });
    const row = primary.closest(".staff-access-row");
    expect(row).not.toBeNull();
    // OFF → hidden.
    expect(row.querySelector(".staff-access-actions").getAttribute("aria-hidden")).toBe("true");
    expect(within(row).queryByRole("button", { name: "Создать" })).toBeNull();
    // ON → the 4 existing secondary actions appear.
    fireEvent.click(primary);
    expect(row.classList.contains("is-open")).toBe(true);
    const secondaries = [...row.querySelectorAll(".staff-access-action")];
    expect(secondaries.map((b) => b.textContent)).toEqual(staffAccessActions.map((a) => a.label));
    expect(secondaries.map((b) => b.textContent)).toEqual(["Создать", "Читать", "Обновлять", "Удалить"]);
    // OFF again → hidden again.
    fireEvent.click(primary);
    expect(row.classList.contains("is-open")).toBe(false);
    expect(row.querySelector(".staff-access-actions").getAttribute("aria-hidden")).toBe("true");
    expect(within(row).queryByRole("button", { name: "Создать" })).toBeNull();
  });

  it("F2. only enabled modules expand; other OFF rows stay collapsed", { timeout: 20000 }, async () => {
    const dialog = await openAddDialog();
    const first = within(dialog).getByRole("button", { name: "Главная" });
    const second = within(dialog).getByRole("button", { name: "Отчет по заказам" });
    fireEvent.click(first);
    expect(first.closest(".staff-access-row").classList.contains("is-open")).toBe(true);
    expect(second.closest(".staff-access-row").classList.contains("is-open")).toBe(false);
    expect(within(second.closest(".staff-access-row")).queryByRole("button", { name: "Создать" })).toBeNull();
    // Special-config module keeps its canonical actions when enabled.
    const types = within(dialog).getByRole("button", { name: "Заказы (типы)" });
    fireEvent.click(types);
    expect(
      [...types.closest(".staff-access-row").querySelectorAll(".staff-access-action")].map((b) => b.textContent),
    ).toEqual(["На вынос", "На стол", "Доставка", "Новый"]);
    fireEvent.click(first);
    fireEvent.click(types);
    expect(dialog.querySelectorAll(".staff-access-row.is-open")).toHaveLength(0);
  });

  it("G. OFF-hidden / ON-visible+available semantics, child state kept in-memory", { timeout: 20000 }, async () => {
    const dialog = await openAddDialog();
    const primary = within(dialog).getByRole("button", { name: "Отчет по заказам" });
    const row = primary.closest(".staff-access-row");
    // OFF → hidden and disabled.
    expect(within(row).queryByRole("button", { name: "Создать" })).toBeNull();
    fireEvent.click(primary);
    const create = within(row).getByRole("button", { name: "Создать" });
    expect(create.disabled).toBe(false);
    expect(create.classList.contains("is-on")).toBe(false);
    fireEvent.click(create);
    expect(create.classList.contains("is-on")).toBe(true);
    // OFF → hidden again, but in-memory child state preserved like Cashier.
    fireEvent.click(primary);
    expect(within(row).queryByRole("button", { name: "Создать" })).toBeNull();
    fireEvent.click(primary);
    expect(within(row).getByRole("button", { name: "Создать" }).classList.contains("is-on")).toBe(true);
  });

  it("H+I. enabled module + secondary action never reach create/edit payloads", { timeout: 20000 }, async () => {
    const created = {
      id: "new-manager-uuid",
      name: "Manager Two",
      email: null,
      phone: "998901112233",
      role_slug: "manager",
      role_slugs: ["manager"],
      is_active: true,
    };
    api.post.mockResolvedValue({ data: created });
    const dialog = await openAddDialog();
    fireEvent.change(screen.getByPlaceholderText("Имя менеджера"), { target: { value: "Manager Two" } });
    fireEvent.change(dialog.querySelector(".staff-phone-field input"), { target: { value: "+998901112233" } });
    fireEvent.change(screen.getByPlaceholderText("Пароль"), { target: { value: "Manager123" } });
    const row = within(dialog).getByRole("button", { name: "Отчет по заказам" }).closest(".staff-access-row");
    fireEvent.click(within(dialog).getByRole("button", { name: "Отчет по заказам" }));
    fireEvent.click(within(row).getByRole("button", { name: "Создать" }));
    fireEvent.click(within(row).getByRole("button", { name: "Удалить" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Добавить" }));
    await screen.findByText("Manager Two");
    expect(api.post).toHaveBeenCalledWith("/auth/users", {
      password: "Manager123",
      phone: "998901112233",
      role_slug: "manager",
      role_name: "Manager Two",
    });
    const sent = api.post.mock.calls[0][1];
    for (const key of ["access", "permissions", "permission_ids", "staffAccess", "create", "read", "update", "delete"]) {
      expect(sent).not.toHaveProperty(key);
    }
  });

  it("K2. secondary state returns to honest default after refetch", { timeout: 20000 }, async () => {
    const { unmount } = render(<StaffRolePage role="manager" />);
    await screen.findByText("Manager One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    const row = within(dialog).getByRole("button", { name: "Отчет по заказам" }).closest(".staff-access-row");
    fireEvent.click(within(dialog).getByRole("button", { name: "Отчет по заказам" }));
    fireEvent.click(within(row).getByRole("button", { name: "Читать" }));
    expect(within(row).getByRole("button", { name: "Читать" }).classList.contains("is-on")).toBe(true);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    unmount();
    render(<StaffRolePage role="manager" />);
    await screen.findByText("Manager One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const fresh = await screen.findByRole("dialog");
    const freshRow = within(fresh).getByRole("button", { name: "Отчет по заказам" }).closest(".staff-access-row");
    expect(within(fresh).getByRole("button", { name: "Отчет по заказам" }).classList.contains("is-on")).toBe(false);
    // Fresh drawer: secondary hidden again (honest default, nothing persisted).
    expect(within(freshRow).queryByRole("button", { name: "Читать" })).toBeNull();
  });

  it("CSS. no role-specific visibility system; shared collapse mechanism intact", () => {    const css = readFileSync(
      `${process.cwd()}/src/styles/owner/staff-users.css`,
      "utf8",
    );
    expect(css).not.toContain("staff-permission-matrix--curated");
    const overrides = readFileSync(
      `${process.cwd()}/src/styles/react-overrides.css`,
      "utf8",
    );
    // OFF = zero-height hidden row…
    expect(overrides).toMatch(/\.staff-access-actions \{[^}]*max-height: 0[^}]*\}/);
    // …ON = expanded row. Same mechanism for every product role.
    expect(overrides).toMatch(/\.staff-access-row\.is-open \.staff-access-actions \{[^}]*max-height:[^0][^}]*\}/);
  });

  it("CSS-PHASE2. secondary row indent, distribution and child gap (shared, no !important)", () => {
    const overrides = readFileSync(
      `${process.cwd()}/src/styles/react-overrides.css`,
      "utf8",
    );
    const grid = overrides.match(
      /\.staff-access-actions \{[^}]*grid-template-columns: repeat\(4, max-content\)[^}]*\}/,
    );
    expect(grid).not.toBeNull();
    // Nested hierarchy: whole child row shifted right, safe right padding.
    expect(grid[0]).toContain("padding-inline-start: 28px");
    expect(grid[0]).toContain("padding-inline-end: 12px");
    // Balanced distribution across the row; max-content columns never wrap.
    expect(grid[0]).toContain("justify-content: space-between");
    expect(grid[0]).not.toContain("!important");
    expect(grid[0]).not.toContain("position: absolute");
    // Child-only comfort gap; parent module rows keep their accepted 12px.
    const childGap = overrides.match(/\.staff-access-action \{[^}]*gap: 16px[^}]*\}/);
    expect(childGap).not.toBeNull();
    const sharedGap = overrides.match(/\.staff-access-toggle,\s*\.staff-access-action \{[^}]*gap: 12px[^}]*\}/);
    expect(sharedGap).not.toBeNull();
  });
});
