import { cleanup, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import StaffRolePage from "../StaffRolePage";

// STAFF-PRINTER-SCOPE-02: привязка принтера — свойство записи сотрудника.
// Контракт, который тут заморожен:
//   1) имя принтера видно у ЛЮБОЙ роли, а не только у моноблока;
//   2) оно не живёт в колонке прав доступа (там гранты, а не оборудование);
//   3) нет привязки — нет подписи; нет имени в справочнике — тоже нет подписи,
//      никаких слов-заглушек вроде «Принтер» вместо имени.

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

const PRINTERS = [
  { id: "prn-kitchen", name: "Принтер кухни", branch_id: "br-1", is_active: true },
  { id: "prn-bar", name: "Принтер бара", branch_id: "br-1", is_active: true },
  // Неактивный принтер отфильтрован из справочника страницы: привязка на него
  // остаётся в записи, но имени для подписи взять неоткуда.
  { id: "prn-retired", name: "Списанный принтер", branch_id: "br-1", is_active: false },
];

const cashier = {
  id: "u-cashier",
  name: "Кассир Один",
  email: "cashier@marjon.test",
  phone: "998901112233",
  role_slug: "cashier",
  role_slugs: ["cashier"],
  is_active: true,
};

const waiter = {
  ...cashier,
  id: "u-waiter",
  name: "Официант Один",
  email: "waiter@marjon.test",
  role_slug: "waiter",
  role_slugs: ["waiter"],
};

const monoblock = {
  ...cashier,
  id: "u-monoblock",
  name: "Моноблок Один",
  email: "monoblock@marjon.test",
  role_slug: "monoblock",
  role_slugs: ["monoblock"],
};

function mockApi(user, printers = PRINTERS) {
  api.get.mockImplementation((url) => {
    const path = String(url);
    if (path.includes("/printers")) return Promise.resolve({ data: printers });
    if (path.includes("/branches")) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [user] });
  });
}

async function renderRole(role, user, printers) {
  mockApi(user, printers);
  render(<StaffRolePage role={role} />);
  await screen.findByText(user.name);
  const table = document.querySelector(".staff-table");
  expect(table).not.toBeNull();
  return table;
}

describe("staff printer binding contract — STAFF-PRINTER-SCOPE-02", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    api.post.mockResolvedValue({ data: {} });
    api.patch.mockResolvedValue({ data: {} });
    api.delete.mockResolvedValue({ data: {} });
  });

  it.each([
    ["cashier", cashier],
    ["waiter", waiter],
    ["monoblock", monoblock],
  ])("renders the bound printer for the %s role", async (role, user) => {
    const table = await renderRole(role, { ...user, printer_id: "prn-bar" });

    const name = table.querySelector(".staff-printer-name");
    expect(name).not.toBeNull();
    expect(name).toHaveTextContent("Принтер бара");
    // Имя не подменяется идентификатором и не дублируется.
    expect(name.textContent).not.toContain("prn-bar");
    expect(table.querySelectorAll(".staff-printer-name")).toHaveLength(1);
    // Подпись стоит рядом с бейджем роли — это одно и то же «место записи».
    const roleCell = name.closest(".staff-role-cell");
    expect(roleCell).not.toBeNull();
    expect(roleCell.querySelector(".staff-role-badge")).not.toBeNull();
    // И полное имя доступно как подсказка (в ячейке оно может обрезаться).
    expect(name).toHaveAttribute("title", "Принтер: Принтер бара");
  });

  it("keeps the printer out of the access column for cashier and waiter", async () => {
    for (const [role, user] of [["cashier", cashier], ["waiter", waiter]]) {
      const table = await renderRole(role, { ...user, printer_id: "prn-bar" });
      const accessCells = [...table.querySelectorAll(".staff-permission")];
      expect(accessCells.length).toBeGreaterThan(0);
      for (const cell of accessCells) {
        expect(cell.querySelector(".staff-printer-name")).toBeNull();
        expect(cell.querySelector(".staff-permission-sub")).toBeNull();
        expect(cell.textContent).not.toContain("Принтер бара");
      }
      // Права доступа остались правами: только «Удаление блюд».
      expect(within(table).getByText("Удаление блюд")).toBeInTheDocument();
      cleanup();
    }
  });

  it("does not attach the printer to the monoblock access toggle", async () => {
    const table = await renderRole("monoblock", { ...monoblock, printer_id: "prn-bar" });

    const toggle = within(table).getByText("Показать кассиров").closest(".staff-permission");
    expect(toggle).not.toBeNull();
    expect(toggle.querySelector(".staff-permission-sub")).toBeNull();
    expect(toggle.textContent).not.toContain("Принтер бара");
    // Но имя всё равно видно — в ячейке роли.
    expect(table.querySelector(".staff-printer-name")).toHaveTextContent("Принтер бара");
  });

  it("renders nothing when the employee has no printer binding", async () => {
    const table = await renderRole("cashier", { ...cashier, printer_id: null });

    expect(table.querySelector(".staff-printer-name")).toBeNull();
    expect(within(table).queryByText(/^Принтер/)).toBeNull();
  });

  it("never invents a name for a binding that is absent from the dictionary", async () => {
    // Привязка на неактивный принтер: id есть, имени в справочнике нет.
    const table = await renderRole("cashier", { ...cashier, printer_id: "prn-retired" });

    expect(table.querySelector(".staff-printer-name")).toBeNull();
    // Слово-заглушка «Принтер» вместо имени — это ложь о содержимом привязки.
    expect(within(table).queryByText(/^Принтер$/)).toBeNull();
    expect(table.textContent).not.toContain("prn-retired");
  });

  it("shows the name only for the employee that is actually bound", async () => {
    api.get.mockImplementation((url) => {
      const path = String(url);
      if (path.includes("/printers")) return Promise.resolve({ data: PRINTERS });
      if (path.includes("/branches")) return Promise.resolve({ data: [] });
      return Promise.resolve({
        data: [
          { ...cashier, printer_id: "prn-kitchen" },
          { ...waiter, id: "u-waiter-2", name: "Официант Два", email: "w2@marjon.test" },
        ],
      });
    });
    render(<StaffRolePage role="all" />);
    await screen.findByText("Кассир Один");
    await screen.findByText("Официант Два");

    const table = document.querySelector(".staff-table");
    const names = [...table.querySelectorAll(".staff-printer-name")];
    expect(names).toHaveLength(1);
    expect(names[0]).toHaveTextContent("Принтер кухни");

    const boundRow = names[0].closest("tr");
    const unboundRow = within(table).getByText("Официант Два").closest("tr");
    expect(boundRow).not.toBe(unboundRow);
    expect(boundRow).toHaveTextContent("Кассир Один");
    expect(unboundRow.querySelector(".staff-printer-name")).toBeNull();
  });
});
