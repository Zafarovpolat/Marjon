import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NomenclaturePage from "./NomenclaturePage";
import CategoriesPage from "./CategoriesPage";
import StaffPage from "./StaffPage";
import { CategoryPage } from "../admin/AdminApp";
import { api } from "../api/client";
import { adminApi } from "../admin/api";
import { adminFinanceApi } from "../admin/financeApi";

vi.mock("chart.js", () => {
  class ChartMock {
    static register = vi.fn();
    destroy() {}
  }
  return { Chart: ChartMock, CategoryScale: {}, Filler: {}, LineController: {}, LineElement: {}, LinearScale: {}, PointElement: {}, Tooltip: {} };
});

function categoryProps(active) {
  return { active, rowsOverride: null, search: "", onCreate: vi.fn(), onRowDetail: vi.fn(), onNotify: vi.fn(), onInnerBackChange: vi.fn() };
}

function mockStaffReads({ employees = [] } = {}) {
  return vi.spyOn(api, "get").mockImplementation((path) => {
    if (path === "/hr/employees") return Promise.resolve({ data: employees });
    if (path === "/auth/users") return Promise.resolve({ data: [
      { id: "owner-uuid", email: "owner@example.test", name: "Owner", role_slug: "owner", role_slugs: ["owner"], is_active: true, is_superadmin: false },
      { id: "staff-uuid", email: "staff@example.test", name: "Selected Staff", role_slug: "cashier", role_slugs: ["cashier"], is_active: true, is_superadmin: false },
      { id: "super-uuid", email: "super@example.test", name: "Super", role_slug: null, role_slugs: [], is_active: true, is_superadmin: true },
      { id: "ambiguous-uuid", email: "ambiguous@example.test", name: "Ambiguous", role_slug: "cashier", role_slugs: ["cashier", "waiter"], is_active: true, is_superadmin: false },
    ] });
    if (path === "/companies/me/branches") return Promise.resolve({ data: [{ id: "branch-uuid", name: "Backend Branch" }] });
    return Promise.reject(new Error(`Unexpected path ${path}`));
  });
}

function mockHandbooks(values = {}) {
  return vi.spyOn(adminApi, "get").mockImplementation((path) => {
    const data = {
      "/countries": values.countries ?? [{ id: "country-uuid", name: "Backend Country", status: true }],
      "/regions": values.regions ?? [{ id: "region-uuid", name: "Backend Region", country_id: "country-uuid", status: true }],
      "/districts": values.districts ?? [{ id: "district-uuid", name: "Backend District", region_id: "region-uuid", status: false }],
    }[path];
    return data ? Promise.resolve({ data: { items: data, total: data.length, page: 1, size: 100, pages: data.length ? 1 : 0 } }) : Promise.reject(new Error(`Unexpected path ${path}`));
  });
}

describe("CTR-02 remaining critical truth gaps", () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each([["raw", "Сырьё"], ["semi", "Полуфабрикаты"]])("renders %s safely as deferred without inventory calls", (type, title) => {
    const get = vi.spyOn(api, "get");
    render(<NomenclaturePage type={type} />);
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("не зафиксирован");
    expect(screen.queryByRole("button", { name: /Добавить/i })).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it.each(["raw", "semi"])("keeps %s categories deferred and never mutates ProductCategory", (type) => {
    const get = vi.spyOn(api, "get");
    const post = vi.spyOn(api, "post");
    const patch = vi.spyOn(api, "patch");
    const remove = vi.spyOn(api, "delete");
    render(<CategoriesPage type={type} />);
    expect(screen.getByRole("status")).toHaveTextContent("ProductCategory не используется");
    expect(screen.queryByRole("button", { name: /Добавить/i })).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("requires an eligible selected staff UUID and excludes OWNER/SUPER_ADMIN", async () => {
    mockStaffReads();
    const post = vi.spyOn(api, "post");
    render(<StaffPage />);
    await screen.findByText("Сотрудников пока нет.");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    const selector = screen.getByLabelText("Учётная запись сотрудника");
    expect(selector).toHaveTextContent("Selected Staff — staff@example.test");
    expect(selector).not.toHaveTextContent("owner@example.test");
    expect(selector).not.toHaveTextContent("super@example.test");
    expect(selector).not.toHaveTextContent("ambiguous@example.test");
    fireEvent.change(screen.getByLabelText("Филиал"), { target: { value: "branch-uuid" } });
    fireEvent.change(screen.getByLabelText("Позиция"), { target: { value: "Кассир" } });
    fireEvent.submit(screen.getByRole("button", { name: "Сохранить" }).closest("form"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Выберите доступную");
    expect(post).not.toHaveBeenCalled();
  });

  it("creates an employee with the selected staff user_id and authoritative refetch", async () => {
    mockStaffReads();
    vi.spyOn(api, "post").mockResolvedValue({ data: { id: "employee-uuid", user_id: "staff-uuid", branch_id: "branch-uuid", position: "Кассир", hire_date: "2026-08-13", salary_type: "fixed", salary_amount: 500 } });
    render(<StaffPage />);
    await screen.findByText("Сотрудников пока нет.");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    fireEvent.change(screen.getByLabelText("Учётная запись сотрудника"), { target: { value: "staff-uuid" } });
    fireEvent.change(screen.getByLabelText("Филиал"), { target: { value: "branch-uuid" } });
    fireEvent.change(screen.getByLabelText("Позиция"), { target: { value: "Кассир" } });
    fireEvent.change(screen.getByLabelText("Сумма"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/hr/employees", expect.objectContaining({ user_id: "staff-uuid", branch_id: "branch-uuid", position: "Кассир", salary_type: "fixed", salary_amount: 500 })));
    expect(api.post.mock.calls[0][1].user_id).not.toBe("owner-uuid");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the staff drawer open and does not fabricate success after backend failure", async () => {
    mockStaffReads();
    vi.spyOn(api, "post").mockRejectedValue({ response: { data: { detail: "Backend rejected employee" } } });
    render(<StaffPage />);
    await screen.findByText("Сотрудников пока нет.");
    fireEvent.click(screen.getByRole("button", { name: /Добавить/ }));
    fireEvent.change(screen.getByLabelText("Учётная запись сотрудника"), { target: { value: "staff-uuid" } });
    fireEvent.change(screen.getByLabelText("Филиал"), { target: { value: "branch-uuid" } });
    fireEvent.change(screen.getByLabelText("Позиция"), { target: { value: "Кассир" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Backend rejected employee");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Сотрудников пока нет.")).toBeInTheDocument();
  });

  it("renders authoritative countries, regions, and districts with ID-based joins", async () => {
    mockHandbooks();
    const { rerender } = render(<CategoryPage {...categoryProps("hb-countries")} />);
    expect(await screen.findByText("Backend Country")).toBeInTheDocument();
    rerender(<CategoryPage {...categoryProps("hb-regions")} />);
    expect(await screen.findByText("Backend Region")).toBeInTheDocument();
    expect(screen.getByText("Backend Country")).toHaveAttribute("data-country-id", "country-uuid");
    rerender(<CategoryPage {...categoryProps("hb-districts")} />);
    expect(await screen.findByText("Backend District")).toBeInTheDocument();
    expect(screen.getByText("Backend Region")).toHaveAttribute("data-region-id", "region-uuid");
    expect(screen.getByText("#неактивно")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Добавить|Редактировать|Удалить/ })).not.toBeInTheDocument();
  });

  it("distinguishes truthful handbook empty from error", async () => {
    mockHandbooks({ countries: [], regions: [], districts: [] });
    const view = render(<CategoryPage {...categoryProps("hb-countries")} />);
    expect(await screen.findByText("Список пуст")).toBeInTheDocument();
    view.unmount();
    vi.restoreAllMocks();
    vi.spyOn(adminApi, "get").mockRejectedValue(new Error("network"));
    render(<CategoryPage {...categoryProps("hb-countries")} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить справочник");
    expect(screen.queryByText("Список пуст")).not.toBeInTheDocument();
  });

  it("renders real HQ bank transactions without a fabricated status", async () => {
    vi.spyOn(adminFinanceApi, "listTransactions").mockResolvedValue({ data: { items: [{ id: "tx-uuid", organization_id: "org-uuid", date: "2026-08-13T10:20:00Z", amount: 125000, direction: "income", comment: "Backend bank row" }] } });
    render(<CategoryPage {...categoryProps("bank-transactions")} />);
    expect(await screen.findByText("tx-uuid")).toBeInTheDocument();
    expect(screen.getByText("org-uuid")).toBeInTheDocument();
    expect(screen.getByText(/125.*000 UZS/)).toBeInTheDocument();
    expect(screen.getByText("Backend bank row")).toBeInTheDocument();
    expect(screen.queryByText(/PAID|Завершено|Оплачено/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Создать" })).not.toBeInTheDocument();
  });

  it("distinguishes HQ bank empty from transport error", async () => {
    vi.spyOn(adminFinanceApi, "listTransactions").mockResolvedValue({ data: { items: [] } });
    const view = render(<CategoryPage {...categoryProps("bank-transactions")} />);
    expect(await screen.findByText("Список пуст.")).toBeInTheDocument();
    view.unmount();
    vi.restoreAllMocks();
    vi.spyOn(adminFinanceApi, "listTransactions").mockRejectedValue(new Error("network"));
    render(<CategoryPage {...categoryProps("bank-transactions")} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить данные");
    expect(screen.queryByText("Список пуст.")).not.toBeInTheDocument();
  });
});
