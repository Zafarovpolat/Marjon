import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import StaffRolePage from "../StaffRolePage";

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

const monoblockUser = {
  id: "monoblock-uuid",
  name: "Monoblock One",
  email: null,
  phone: "998901234567",
  role_slug: "monoblock",
  role_slugs: ["monoblock"],
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

const MONOBLOCK_PRIMARY = [
  "Статус",
  "Главный моноблок",
  "Список кассиров",
  "Принтер повара",
  "Печать отмены заказа",
];

describe("monoblock page visual contract (/users/monoblock) — MONOBLOCK-01", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: [monoblockUser, cashierUser] });
    api.post.mockResolvedValue({ data: monoblockUser });
    api.patch.mockResolvedValue({ data: monoblockUser });
    api.delete.mockResolvedValue({ data: {} });
  });

  it("renders title, product header and role isolation", async () => {
    render(<StaffRolePage role="monoblock" />);
    expect(await screen.findByText("Monoblock One")).toBeInTheDocument();
    expect(screen.queryByText("Cashier One")).not.toBeInTheDocument();
    expect(screen.getByText("Список сотрудников: Моноблок")).toBeInTheDocument();
    expect(screen.getByText("Пользователи")).toBeInTheDocument();
    expect(document.querySelector(".staff-filters")).toBeNull();
    expect(document.querySelector("header.staff-header--cashier")).not.toBeNull();
  });

  it("renders the 8 product columns with role Моноблок", async () => {
    render(<StaffRolePage role="monoblock" />);
    await screen.findByText("Monoblock One");
    const headers = screen.getAllByRole("columnheader").map((c) => c.textContent);
    expect(headers).toEqual([
      "ID",
      "Фото",
      "ФИО",
      "Номер телефона",
      "Роль",
      "Права доступа",
      "Статус",
      "Действия",
    ]);
    const table = document.querySelector(".staff-table");
    expect(within(table).queryByText("Email")).toBeNull();
    expect(within(table).getByText("Моноблок")).toBeInTheDocument();
    expect(within(table).queryByText("Кассир")).toBeNull();
    expect(within(table).getByText("Активен")).toBeInTheDocument();
  });

  it("add drawer shows MARJON product form without Email or role selector", { timeout: 20000 }, async () => {
    render(<StaffRolePage role="monoblock" />);
    await screen.findByText("Monoblock One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector(".staff-form--cashier")).not.toBeNull();
    expect(dialog.classList.contains("staff-modal--cashier-full")).toBe(true);
    expect(within(dialog).getByText("Добавить моноблок")).toBeInTheDocument();
    expect(within(dialog).getByText("Загрузить фото")).toBeInTheDocument();
    expect(within(dialog).getByText("Имя")).toBeInTheDocument();
    expect(within(dialog).getByText("Номер телефона")).toBeInTheDocument();
    expect(within(dialog).getByText("Пароль")).toBeInTheDocument();
    expect(within(dialog).getByText("IP адрес принтера")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Имя моноблока")).toBeInTheDocument();
    expect(within(dialog).queryByText("Email")).toBeNull();
    expect(dialog.querySelector("select")).toBeNull();
  });

  it("shows exactly the 5 primary monoblock switches plus the detailed matrix", { timeout: 20000 }, async () => {
    render(<StaffRolePage role="monoblock" />);
    await screen.findByText("Monoblock One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    const primary = dialog.querySelectorAll(
      ".cashier-permission-switches .staff-permission-switch",
    );
    expect(primary).toHaveLength(5);
    for (const label of MONOBLOCK_PRIMARY) {
      if (label === "Статус") {
        expect(within(dialog).getByText("Статус")).toBeInTheDocument();
      } else {
        expect(within(dialog).getByRole("button", { name: label })).toBeInTheDocument();
      }
    }
    expect([...primary].filter((b) => b.disabled)).toHaveLength(0);
    expect(within(dialog).getByRole("button", { name: "Главная" })).toBeInTheDocument();
    expect(dialog.querySelector(".staff-permission-matrix")).not.toBeNull();
  });

  it("has no waiter/cashier primary switches", { timeout: 20000 }, async () => {
    render(<StaffRolePage role="monoblock" />);
    await screen.findByText("Monoblock One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    for (const label of [
      "Удаление блюд",
      "Изменить код маркировки",
      "Заказ на вынос за столом",
      "Изменить тип заказа",
      "Может закрыть счёт",
      "Открыть денежный ящик после оплаты",
      "Просмотр закрытых заказов",
    ]) {
      expect(within(dialog).queryByRole("button", { name: label })).toBeNull();
    }
  });

  it("toggles monoblock switches as visual-only form state", { timeout: 20000 }, async () => {
    render(<StaffRolePage role="monoblock" />);
    await screen.findByText("Monoblock One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    for (const label of ["Главный моноблок", "Список кассиров", "Принтер повара", "Печать отмены заказа"]) {
      const button = within(dialog).getByRole("button", { name: label });
      expect(button.classList.contains("is-on")).toBe(false);
      fireEvent.click(button);
      expect(button.classList.contains("is-on")).toBe(true);
      fireEvent.click(button);
      expect(button.classList.contains("is-on")).toBe(false);
    }
  });

  it("creates a monoblock with canonical payload only (no unsupported fields)", { timeout: 20000 }, async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const created = {
      id: "new-monoblock-uuid",
      name: "Monoblock Two",
      email: null,
      phone: "998901112233",
      role_slug: "monoblock",
      role_slugs: ["monoblock"],
      is_active: true,
    };
    api.post.mockResolvedValue({ data: created });
    render(<StaffRolePage role="monoblock" />);
    await screen.findByText("Monoblock One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(screen.getByPlaceholderText("Имя моноблока"), {
      target: { value: "Monoblock Two" },
    });
    fireEvent.change(dialog.querySelector(".staff-phone-field input"), {
      target: { value: "+998901112233" },
    });
    fireEvent.change(screen.getByPlaceholderText("Пароль"), {
      target: { value: "Monoblock1" },
    });
    // Unsupported toggles + printer IP must not reach the backend.
    fireEvent.click(within(dialog).getByRole("button", { name: "Главный моноблок" }));
    fireEvent.change(screen.getByPlaceholderText("192.168.1.10"), {
      target: { value: "192.168.1.10" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Добавить" }));
    await screen.findByText("Monoblock Two");
    expect(api.post).toHaveBeenCalledWith("/auth/users", {
      password: "Monoblock1",
      phone: "998901112233",
      role_slug: "monoblock",
      role_name: "Monoblock Two",
    });
    const sent = api.post.mock.calls[0][1];
    expect(sent).not.toHaveProperty("email");
    expect(sent).not.toHaveProperty("printerIp");
    expect(sent).not.toHaveProperty("printer_ip");
    expect(alertSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: 2000 });
    expect(localStorage.getItem("marjon_staff")).toBeNull();
  });

  it("shows inline name validation without alert and keeps drawer open", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<StaffRolePage role="monoblock" />);
    await screen.findByText("Monoblock One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(screen.getByPlaceholderText("Пароль"), { target: { value: "Monoblock1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Добавить" }));
    const alerts = await within(dialog).findAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0]).toHaveTextContent("Укажите имя и номер телефона моноблока.");
    expect(alertSpy).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("shows inline 409 duplicate phone under the phone field", { timeout: 20000 }, async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    api.post.mockRejectedValueOnce({
      response: { data: { detail: "Phone already registered", code: "CONFLICT" } },
    });
    render(<StaffRolePage role="monoblock" />);
    await screen.findByText("Monoblock One");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(screen.getByPlaceholderText("Имя моноблока"), { target: { value: "Monoblock Two" } });
    fireEvent.change(dialog.querySelector(".staff-phone-field input"), {
      target: { value: "+998901112233" },
    });
    fireEvent.change(screen.getByPlaceholderText("Пароль"), { target: { value: "Monoblock1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Добавить" }));
    const alerts = await within(dialog).findAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
    expect(dialog.querySelector(".staff-phone-error")).not.toBeNull();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("archive and restore flow through backend mutations", async () => {
    render(<StaffRolePage role="monoblock" />);
    await screen.findByText("Monoblock One");
    fireEvent.click(screen.getByTitle("Archive"));
    await screen.findByText("Monoblock One");
    expect(api.delete).toHaveBeenCalledWith("/auth/users/monoblock-uuid");
    fireEvent.click(screen.getByRole("button", { name: "Архивированные" }));
    expect(await screen.findByText("Monoblock One")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Restore"));
    await screen.findByText("Monoblock One");
    expect(api.patch).toHaveBeenCalledWith("/auth/users/monoblock-uuid", { is_active: true });
  });
});

const waiterUser = {
  id: "waiter-uuid",
  name: "Waiter One",
  email: null,
  phone: "998901234567",
  role_slug: "waiter",
  role_slugs: ["waiter"],
  is_active: true,
};

describe("monoblock access cell (cashier-list concept)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: [monoblockUser, cashierUser] });
    api.post.mockResolvedValue({ data: monoblockUser });
    api.patch.mockResolvedValue({ data: monoblockUser });
    api.delete.mockResolvedValue({ data: {} });
  });

  it("shows fixed label without generic text and red indicator by default", async () => {
    render(<StaffRolePage role="monoblock" />);
    await screen.findByText("Monoblock One");
    const table = document.querySelector(".staff-table");
    expect(within(table).queryByText("Базовый доступ")).toBeNull();
    const access = within(table).getByText("Показать кассиров").closest(".staff-permission");
    expect(access).not.toBeNull();
    expect(access.classList.contains("staff-permission--column")).toBe(true);
    expect(access.querySelector(".staff-permission-dot").classList.contains("is-off")).toBe(true);
    expect(access.querySelector(".staff-permission-sub")).toBeNull();
  });

  it("shows green indicator for a truthful future grant", async () => {
    api.get.mockResolvedValue({ data: [{ ...monoblockUser, can_see_cashiers: true }] });
    render(<StaffRolePage role="monoblock" />);
    await screen.findByText("Monoblock One");
    const table = document.querySelector(".staff-table");
    const access = within(table).getByText("Показать кассиров").closest(".staff-permission");
    expect(access.querySelector(".staff-permission-dot").classList.contains("is-off")).toBe(false);
  });

  it("shows printer IP second line only when truthfully present", async () => {
    api.get.mockResolvedValue({
      data: [{ ...monoblockUser, can_see_cashiers: true, printer_ip: "192.168.1.20" }],
    });
    const { unmount } = render(<StaffRolePage role="monoblock" />);
    await screen.findByText("Monoblock One");
    let table = document.querySelector(".staff-table");
    let sub = table.querySelector(".staff-permission-sub");
    expect(sub).not.toBeNull();
    expect(sub).toHaveTextContent("192.168.1.20");
    unmount();
    api.get.mockResolvedValue({ data: [monoblockUser] });
    render(<StaffRolePage role="monoblock" />);
    await screen.findByText("Monoblock One");
    table = document.querySelector(".staff-table");
    expect(table.querySelector(".staff-permission-sub")).toBeNull();
    expect(table.querySelector("*")).not.toBeNull();
  });

  it("keeps cashier and waiter access cells unchanged", async () => {
    const { unmount } = render(<StaffRolePage role="cashier" />);
    await screen.findByText("Cashier One");
    let table = document.querySelector(".staff-table");
    expect(within(table).queryByText("Показать кассиров")).toBeNull();
    expect(within(table).queryByText("Базовый доступ")).toBeNull();
    expect(within(table).getByText("Удаление блюд")).toBeInTheDocument();
    unmount();
    api.get.mockResolvedValue({ data: [waiterUser] });
    render(<StaffRolePage role="waiter" />);
    await screen.findByText("Waiter One");
    table = document.querySelector(".staff-table");
    expect(within(table).queryByText("Показать кассиров")).toBeNull();
    expect(within(table).queryByText("Базовый доступ")).toBeNull();
    expect(within(table).getByText("Удаление блюд")).toBeInTheDocument();
  });
});
