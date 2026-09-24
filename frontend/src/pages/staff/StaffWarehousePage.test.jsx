import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const warehouseUser = {
  id: "warehouse-uuid",
  name: "Storekeeper One",
  email: null,
  phone: "998901234567",
  role_slug: "warehouse",
  role_slugs: ["warehouse"],
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

// CASHIER-PARITY-01 (Phase 1): warehouse mirrors the Cashier matrix contract
// (full ordered label list locked in StaffManagerPage.test.jsx as
// CASHIER_MATRIX_CONTRACT, count 50). Local anchors below guard the parity.
const CASHIER_MATRIX_COUNT = 50;
const CASHIER_MATRIX_ANCHORS = {
  first: "Главная",
  last: "Заказы (типы)",
  middle: ["Z-отчет", "Денежный поток", "Клиенты", "Менеджер", "Отчет по официантам"],
};

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

describe("warehouse page visual contract (/users/warehouse) — WAREHOUSE-01", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: [warehouseUser, cashierUser] });
    api.post.mockResolvedValue({ data: warehouseUser });
    api.patch.mockResolvedValue({ data: warehouseUser });
    api.delete.mockResolvedValue({ data: {} });
  });

  it("A. route uses the warehouse role with isolation and product header", async () => {
    render(<StaffRolePage role="warehouse" />);
    expect(await screen.findByText("Storekeeper One")).toBeInTheDocument();
    expect(screen.queryByText("Cashier One")).not.toBeInTheDocument();
    expect(screen.getByText("Список сотрудников: Завсклад")).toBeInTheDocument();
    expect(document.querySelector(".staff-filters")).toBeNull();
    expect(document.querySelector("header.staff-header--cashier")).not.toBeNull();
    expect(document.querySelector(".staff-card--cashier")).not.toBeNull();
  });

  it("B+C. renders exactly the same 7 columns, no access column", async () => {
    render(<StaffRolePage role="warehouse" />);
    await screen.findByText("Storekeeper One");
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
    expect(within(table).getByText("Завсклад")).toBeInTheDocument();
    expect(within(table).getByText("warehouse-uuid")).toBeInTheDocument();
    expect(within(table).getByText("Активен")).toBeInTheDocument();
  });

  it("D. no HR surface in table or drawer", async () => {
    render(<StaffRolePage role="warehouse" />);
    await screen.findByText("Storekeeper One");
    const table = document.querySelector(".staff-table");
    expect(table.textContent).not.toMatch(/HR/);
    expect(table.textContent).not.toContain("Кадры");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).not.toMatch(/HR/);
    expect(dialog.textContent).not.toContain("Кадры");
    for (const module of staffAccessModules) {
      expect(module.key.toLowerCase()).not.toContain("hr");
      expect(module.label).not.toMatch(/HR/);
      expect(module.label).not.toContain("Кадры");
    }
  });

  it("PARITY. warehouse matrix equals Cashier count/text/order, no extras, HR absent", { timeout: 20000 }, async () => {
    render(<StaffRolePage role="warehouse" />);
    await screen.findByText("Storekeeper One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    const labels = matrixLabelsInDialog(dialog);
    expect(labels).toHaveLength(CASHIER_MATRIX_COUNT);
    expect(labels).toEqual(staffAccessModules.map((m) => m.label));
    expect(labels[0]).toBe(CASHIER_MATRIX_ANCHORS.first);
    expect(labels[labels.length - 1]).toBe(CASHIER_MATRIX_ANCHORS.last);
    // Previously-filtered-out modules are now present (parity, not curation).
    for (const label of CASHIER_MATRIX_ANCHORS.middle) {
      expect(labels).toContain(label);
    }
    expect(dialog.textContent).not.toMatch(/HR/);
  });

  it("E. product drawer with warehouse titles, no Email/printer/upload", { timeout: 20000 }, async () => {
    render(<StaffRolePage role="warehouse" />);
    await screen.findByText("Storekeeper One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector(".staff-form--cashier")).not.toBeNull();
    expect(dialog.classList.contains("staff-modal--cashier-full")).toBe(true);
    expect(dialog.parentElement).toBe(document.body);
    expect(within(dialog).getByText("Добавить завсклада")).toBeInTheDocument();
    expect(within(dialog).queryByText("Загрузить фото")).toBeNull();
    expect(dialog.querySelector('input[type="file"]')).toBeNull();
    expect(within(dialog).getByText("Имя")).toBeInTheDocument();
    expect(within(dialog).getByText("Номер телефона")).toBeInTheDocument();
    expect(within(dialog).getByText("Пароль")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Имя завсклада")).toBeInTheDocument();
    expect(within(dialog).queryByText("Email")).toBeNull();
    expect(within(dialog).queryByText("IP адрес принтера")).toBeNull();
    expect(dialog.querySelector("select")).toBeNull();
    const primary = dialog.querySelectorAll(
      ".cashier-permission-switches .staff-permission-switch",
    );
    expect(primary).toHaveLength(1);
  });

  it("F. canonical validation: name required, +998 phone, password policy, 409 inline", { timeout: 20000 }, async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    // Name required.
    render(<StaffRolePage role="warehouse" />);
    await screen.findByText("Storekeeper One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    let dialog = await screen.findByRole("dialog");
    fireEvent.change(screen.getByPlaceholderText("Пароль"), {
      target: { value: "Storekeeper1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Добавить" }));
    let alerts = await within(dialog).findAllByRole("alert");
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveTextContent("Укажите имя и номер телефона завсклада.");
    expect(api.post).not.toHaveBeenCalled();
    // Phone formatting.
    const input = dialog.querySelector(".staff-phone-field--split input");
    fireEvent.change(input, { target: { value: "+998901234567" } });
    expect(input.value).toBe("(90) 123-45-67");
    // Weak password blocked.
    fireEvent.change(screen.getByPlaceholderText("Имя завсклада"), {
      target: { value: "Storekeeper Two" },
    });
    fireEvent.change(screen.getByPlaceholderText("Пароль"), {
      target: { value: "weak" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Добавить" }));
    alerts = await within(dialog).findAllByRole("alert");
    expect(alerts[0]).toHaveTextContent("Пароль должен содержать минимум 8 символов, букву и цифру.");
    expect(api.post).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("G+H+I. create sends canonical warehouse payload only", { timeout: 20000 }, async () => {
    const created = {
      id: "new-warehouse-uuid",
      name: "Storekeeper Two",
      email: null,
      phone: "998901112233",
      role_slug: "warehouse",
      role_slugs: ["warehouse"],
      is_active: true,
    };
    api.post.mockResolvedValue({ data: created });
    render(<StaffRolePage role="warehouse" />);
    await screen.findByText("Storekeeper One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(screen.getByPlaceholderText("Имя завсклада"), {
      target: { value: "Storekeeper Two" },
    });
    fireEvent.change(dialog.querySelector(".staff-phone-field input"), {
      target: { value: "+998901112233" },
    });
    fireEvent.change(screen.getByPlaceholderText("Пароль"), {
      target: { value: "Storekeeper1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Склады (Остаток товаров)" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Добавить" }));
    await screen.findByText("Storekeeper Two");
    expect(api.post).toHaveBeenCalledWith("/auth/users", {
      password: "Storekeeper1",
      phone: "998901112233",
      role_slug: "warehouse",
      role_name: "Storekeeper Two",
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
    expect(localStorage.getItem("marjon_staff")).toBeNull();
    expect(sessionStorage.getItem("marjon_staff")).toBeNull();
  });

  it("edit omits password when untouched and never sends photo/permissions", async () => {
    api.patch.mockResolvedValue({ data: { ...warehouseUser, name: "Storekeeper Two" } });
    render(<StaffRolePage role="warehouse" />);
    await screen.findByText("Storekeeper One");
    fireEvent.click(screen.getByTitle("Edit"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Изменить завсклада")).toBeInTheDocument();
    expect(within(dialog).getByText("Новый пароль")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Имя завсклада"), {
      target: { value: "Storekeeper Two" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    await waitForExpectPatch();
    const [, payload] = api.patch.mock.calls[0];
    expect(payload.password).toBeFalsy();
    expect(payload).toHaveProperty("role_slug", "warehouse");
    expect(payload).not.toHaveProperty("photo");
    expect(payload).not.toHaveProperty("access");
    expect(payload).not.toHaveProperty("email");
  });

  it("409 edit-time duplicate maps to Russian phone error, drawer stays open", { timeout: 20000 }, async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    api.patch.mockRejectedValueOnce({
      response: { data: { detail: "Phone already in use" } },
    });
    render(<StaffRolePage role="warehouse" />);
    await screen.findByText("Storekeeper One");
    fireEvent.click(screen.getByTitle("Edit"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    const alerts = await within(dialog).findAllByRole("alert");
    expect(alerts).toHaveLength(2);
    for (const alert of alerts) {
      expect(alert).toHaveTextContent("Этот номер уже используется");
    }
    expect(dialog.querySelector(".staff-phone-error")).not.toBeNull();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("J. archive/restore through backend mutations", async () => {
    render(<StaffRolePage role="warehouse" />);
    await screen.findByText("Storekeeper One");
    fireEvent.click(screen.getByTitle("Archive"));
    await screen.findByText("Storekeeper One");
    expect(api.delete).toHaveBeenCalledWith("/auth/users/warehouse-uuid");
    fireEvent.click(screen.getByRole("button", { name: "Архивированные" }));
    expect(await screen.findByText("Storekeeper One")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Restore"));
    await screen.findByText("Storekeeper One");
    expect(api.patch).toHaveBeenCalledWith("/auth/users/warehouse-uuid", {
      is_active: true,
    });
  });

  it("K. empty state colSpan 7 with illustration", async () => {
    api.get.mockResolvedValue({ data: [] });
    render(<StaffRolePage role="warehouse" />);
    const title = await screen.findByText("Сотрудники не найдены");
    const emptyCell = title.closest("td");
    expect(emptyCell.getAttribute("colSpan")).toBe("7");
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
    const table = document.querySelector(".staff-table");
    expect(table.querySelector(".owner-report-empty-image")).not.toBeNull();
    expect(table.classList.contains("staff-table--no-access")).toBe(true);
  });

  it("L. matrix shows the full Cashier module list (flow curation removed)", { timeout: 20000 }, async () => {
    render(<StaffRolePage role="warehouse" />);
    await screen.findByText("Storekeeper One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector(".staff-permission-matrix")).not.toBeNull();
    expect(matrixLabelsInDialog(dialog)).toEqual(staffAccessModules.map((m) => m.label));
    expect(matrixLabelsInDialog(dialog)).toHaveLength(CASHIER_MATRIX_COUNT);
  });

  it("L2. warehouse toggle is frontend-only with honest default after refetch", { timeout: 20000 }, async () => {
    const { unmount } = render(<StaffRolePage role="warehouse" />);
    await screen.findByText("Storekeeper One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    const toggle = within(dialog).getByRole("button", { name: "Инвентаризация" });
    expect(toggle.classList.contains("is-on")).toBe(false);
    fireEvent.click(toggle);
    expect(toggle.classList.contains("is-on")).toBe(true);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    unmount();
    render(<StaffRolePage role="warehouse" />);
    await screen.findByText("Storekeeper One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const fresh = await screen.findByRole("dialog");
    expect(
      within(fresh).getByRole("button", { name: "Инвентаризация" }).classList.contains("is-on"),
    ).toBe(false);
  });
});

describe("warehouse secondary action toggles (parity with cashier/waiter matrix) — MANAGER-STOREKEEPER-02", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: [warehouseUser, cashierUser] });
    api.post.mockResolvedValue({ data: warehouseUser });
    api.patch.mockResolvedValue({ data: warehouseUser });
    api.delete.mockResolvedValue({ data: {} });
  });

  async function openAddDialog() {
    render(<StaffRolePage role="warehouse" />);
    await screen.findByText("Storekeeper One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    return screen.findByRole("dialog");
  }

  it("E. OFF modules render collapsed: no secondary switches visible", { timeout: 20000 }, async () => {
    const dialog = await openAddDialog();
    const matrix = dialog.querySelector(".staff-permission-matrix");
    expect(matrix).not.toBeNull();
    expect(matrix.classList.contains("staff-permission-matrix--curated")).toBe(false);
    expect(matrix.querySelectorAll(".staff-access-row")).toHaveLength(CASHIER_MATRIX_COUNT);
    expect(matrix.querySelector(".staff-access-row.is-open")).toBeNull();
    expect(matrix.querySelectorAll(".staff-access-action")).toHaveLength(CASHIER_MATRIX_COUNT * 4);
    expect(within(dialog).queryByRole("button", { name: "Создать" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Читать" })).toBeNull();
  });

  it("F. representative module hides/shows secondary actions on OFF/ON", { timeout: 20000 }, async () => {
    const dialog = await openAddDialog();
    const primary = within(dialog).getByRole("button", { name: "Склады (Остаток товаров)" });
    const row = primary.closest(".staff-access-row");
    expect(row).not.toBeNull();
    expect(row.querySelector(".staff-access-actions").getAttribute("aria-hidden")).toBe("true");
    expect(within(row).queryByRole("button", { name: "Создать" })).toBeNull();
    fireEvent.click(primary);
    expect(row.classList.contains("is-open")).toBe(true);
    const secondaries = [...row.querySelectorAll(".staff-access-action")];
    expect(secondaries.map((b) => b.textContent)).toEqual(staffAccessActions.map((a) => a.label));
    expect(secondaries.map((b) => b.textContent)).toEqual(["Создать", "Читать", "Обновлять", "Удалить"]);
    fireEvent.click(primary);
    expect(row.classList.contains("is-open")).toBe(false);
    expect(within(row).queryByRole("button", { name: "Создать" })).toBeNull();
  });

  it("F2. only enabled modules expand; other OFF rows stay collapsed", { timeout: 20000 }, async () => {
    const dialog = await openAddDialog();
    const first = within(dialog).getByRole("button", { name: "Склады (Остаток товаров)" });
    const second = within(dialog).getByRole("button", { name: "Приход товаров" });
    fireEvent.click(first);
    expect(first.closest(".staff-access-row").classList.contains("is-open")).toBe(true);
    expect(second.closest(".staff-access-row").classList.contains("is-open")).toBe(false);
    expect(within(second.closest(".staff-access-row")).queryByRole("button", { name: "Создать" })).toBeNull();
    fireEvent.click(first);
    expect(dialog.querySelectorAll(".staff-access-row.is-open")).toHaveLength(0);
    // Canonical per-module actions preserved: order_types keeps its own set.
    const types = within(dialog).getByRole("button", { name: "Заказы (типы)" });
    fireEvent.click(types);
    expect(
      [...types.closest(".staff-access-row").querySelectorAll(".staff-access-action")].map((b) => b.textContent),
    ).toEqual(["На вынос", "На стол", "Доставка", "Новый"]);
    fireEvent.click(types);
  });

  it("G. OFF-hidden / ON-visible+available semantics, child state kept in-memory", { timeout: 20000 }, async () => {
    const dialog = await openAddDialog();
    const primary = within(dialog).getByRole("button", { name: "Приход товаров" });
    const row = primary.closest(".staff-access-row");
    expect(within(row).queryByRole("button", { name: "Обновлять" })).toBeNull();
    fireEvent.click(primary);
    const update = within(row).getByRole("button", { name: "Обновлять" });
    expect(update.disabled).toBe(false);
    fireEvent.click(update);
    expect(update.classList.contains("is-on")).toBe(true);
    fireEvent.click(primary);
    expect(within(row).queryByRole("button", { name: "Обновлять" })).toBeNull();
    fireEvent.click(primary);
    expect(within(row).getByRole("button", { name: "Обновлять" }).classList.contains("is-on")).toBe(true);
  });

  it("H. enabled module + secondary action never reach payloads", { timeout: 20000 }, async () => {
    const created = {
      id: "new-warehouse-uuid",
      name: "Storekeeper Two",
      email: null,
      phone: "998901112233",
      role_slug: "warehouse",
      role_slugs: ["warehouse"],
      is_active: true,
    };
    api.post.mockResolvedValue({ data: created });
    const dialog = await openAddDialog();
    fireEvent.change(screen.getByPlaceholderText("Имя завсклада"), { target: { value: "Storekeeper Two" } });
    fireEvent.change(dialog.querySelector(".staff-phone-field input"), { target: { value: "+998901112233" } });
    fireEvent.change(screen.getByPlaceholderText("Пароль"), { target: { value: "Storekeeper1" } });
    const row = within(dialog).getByRole("button", { name: "Склады (Остаток товаров)" }).closest(".staff-access-row");
    fireEvent.click(within(dialog).getByRole("button", { name: "Склады (Остаток товаров)" }));
    fireEvent.click(within(row).getByRole("button", { name: "Создать" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Добавить" }));
    await screen.findByText("Storekeeper Two");
    expect(api.post).toHaveBeenCalledWith("/auth/users", {
      password: "Storekeeper1",
      phone: "998901112233",
      role_slug: "warehouse",
      role_name: "Storekeeper Two",
    });
    const sent = api.post.mock.calls[0][1];
    for (const key of ["access", "permissions", "permission_ids", "staffAccess", "create", "read", "update", "delete"]) {
      expect(sent).not.toHaveProperty(key);
    }
  });

  it("K2. secondary state returns to honest default after refetch", { timeout: 20000 }, async () => {
    const { unmount } = render(<StaffRolePage role="warehouse" />);
    await screen.findByText("Storekeeper One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    const row = within(dialog).getByRole("button", { name: "Перемещения" }).closest(".staff-access-row");
    fireEvent.click(within(dialog).getByRole("button", { name: "Перемещения" }));
    fireEvent.click(within(row).getByRole("button", { name: "Удалить" }));
    expect(within(row).getByRole("button", { name: "Удалить" }).classList.contains("is-on")).toBe(true);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    unmount();
    render(<StaffRolePage role="warehouse" />);
    await screen.findByText("Storekeeper One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const fresh = await screen.findByRole("dialog");
    const freshRow = within(fresh).getByRole("button", { name: "Перемещения" }).closest(".staff-access-row");
    expect(within(fresh).getByRole("button", { name: "Перемещения" }).classList.contains("is-on")).toBe(false);
    // Fresh drawer: secondary hidden again (honest default, nothing persisted).
    expect(within(freshRow).queryByRole("button", { name: "Удалить" })).toBeNull();
  });
});
