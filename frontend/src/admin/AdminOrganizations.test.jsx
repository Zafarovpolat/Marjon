import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CategoryPage } from "./AdminSectionRouter";
import {
  OrganizationDirectoryPage,
  normalizeOrganization,
} from "./AdminOrganizationDirectory";
import { OrganizationStatusPage } from "./AdminOrganizationStatus";
import { hqService } from "./hqService";

vi.mock("./hqService", () => ({
  hqService: {
    listSection: vi.fn(),
    listOrganizations: vi.fn(),
    listOrganizationStatuses: vi.fn(),
    createOrganization: vi.fn(),
    updateOrganization: vi.fn(),
    archiveOrganization: vi.fn(),
    createOrganizationStatus: vi.fn(),
    updateOrganizationStatus: vi.fn(),
    deleteOrganizationStatus: vi.fn(),
  },
}));

const STATUS = { id: "status-1", name: "Подключена", sort: 10, status: true };
const ORGANIZATION = {
  id: "org-1",
  name: "Canonical Cafe",
  type: "cafe",
  tariff_price: "125000.00",
  working_days: 24,
  tin: "309998877",
  installation_date: "2026-08-15",
  organization_status_id: STATUS.id,
  status: "active",
  online_menu: true,
  enabled_storage_integration: false,
  is_solvent: true,
  is_billing_autoblock: false,
  owner_name: null,
  admin_name: "Canonical Admin",
  branches_count: null,
  cash_balance: "9000.00",
};

function page(items, overrides = {}) {
  return { data: { items, total: items.length, page: 1, size: 20, pages: 1, ...overrides } };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function renderOrganizations(props = {}) {
  return render(<OrganizationDirectoryPage search="" onNotify={vi.fn()} {...props} />);
}

function renderStatuses(props = {}) {
  return render(<OrganizationStatusPage search="" onNotify={vi.fn()} {...props} />);
}

describe("HQ-01 organizations", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    hqService.listOrganizations.mockResolvedValue(page([ORGANIZATION]));
    hqService.listOrganizationStatuses.mockResolvedValue(page([STATUS]));
    hqService.createOrganization.mockResolvedValue({ data: ORGANIZATION });
    hqService.updateOrganization.mockResolvedValue({ data: ORGANIZATION });
    hqService.archiveOrganization.mockResolvedValue({ data: null });
  });

  it("renders loading, empty, full, and error states truthfully", async () => {
    const pending = deferred();
    hqService.listOrganizations.mockReturnValueOnce(pending.promise);
    const view = renderOrganizations();
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("Загрузка организаций");
    pending.resolve(page([]));
    expect(await screen.findByText("Организации не найдены.")).toBeInTheDocument();
    view.unmount();

    hqService.listOrganizations.mockResolvedValueOnce(page([ORGANIZATION]));
    const full = renderOrganizations();
    expect(await screen.findByText("Canonical Cafe")).toBeInTheDocument();
    full.unmount();

    hqService.listOrganizations.mockRejectedValueOnce(new Error("Canonical failure"));
    renderOrganizations();
    expect(await screen.findByRole("alert")).toHaveTextContent("Canonical failure");
  });

  it("never fabricates access status or an unknown branch count", () => {
    const unknown = normalizeOrganization({ ...ORGANIZATION, organization_status_id: null });
    expect(unknown.accessStatus).toBe("—");
    expect(unknown.accessStatus).not.toBe("Доступен");
    expect(unknown.branches).toBe("—");
    expect(unknown.branches).not.toBe("0");

    const knownZero = normalizeOrganization({ ...ORGANIZATION, branches_count: 0 });
    expect(knownZero.branches).toBe("0");
  });

  it("renders the canonical linked organization status", async () => {
    renderOrganizations();
    expect((await screen.findAllByText("Подключена")).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Доступен")).not.toBeInTheDocument();
  });

  it("uses server metadata and sends canonical pagination", async () => {
    hqService.listOrganizations.mockImplementation((params) => Promise.resolve(page(
      [{ ...ORGANIZATION, id: `org-${params.page}`, name: `Page ${params.page}` }],
      { total: 45, page: params.page, size: params.size, pages: 3 },
    )));
    renderOrganizations();
    expect(await screen.findByText("Page 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Следующая страница" }));
    expect(await screen.findByText("Page 2")).toBeInTheDocument();
    expect(hqService.listOrganizations).toHaveBeenLastCalledWith(
      { page: 2, size: 20 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByText("21-21 из 45")).toBeInTheDocument();
  });

  it("applies backend-supported search and filters and shows no-results", async () => {
    hqService.listOrganizations.mockResolvedValueOnce(page([ORGANIZATION])).mockResolvedValueOnce(page([]));
    renderOrganizations();
    await screen.findByText("Canonical Cafe");
    fireEvent.change(screen.getByPlaceholderText("Поиск по названию или ИНН"), { target: { value: "needle" } });
    fireEvent.change(screen.getByLabelText("Состояние организации"), { target: { value: "blocked" } });
    fireEvent.change(screen.getByLabelText("Статус организации"), { target: { value: STATUS.id } });
    fireEvent.click(screen.getByRole("button", { name: "Применить" }));

    expect(await screen.findByText("По заданным условиям организации не найдены.")).toBeInTheDocument();
    expect(hqService.listOrganizations).toHaveBeenLastCalledWith(
      { page: 1, size: 20, search: "needle", status: "blocked", organization_status_id: STATUS.id },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("creates once, protects against double submit, and canonically refetches", async () => {
    const create = deferred();
    hqService.createOrganization.mockReturnValueOnce(create.promise);
    renderOrganizations();
    await screen.findByText("Canonical Cafe");
    fireEvent.click(screen.getByRole("button", { name: /^Добавить/ }));
    const dialog = screen.getByRole("dialog", { name: "Добавить организацию" });
    fireEvent.change(within(dialog).getByLabelText("Название"), { target: { value: "Created Org" } });
    const save = within(dialog).getByRole("button", { name: "Сохранить" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(hqService.createOrganization).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole("button", { name: "Сохранение..." })).toBeDisabled();
    create.resolve({ data: { ...ORGANIZATION, name: "Created Org" } });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Добавить организацию" })).not.toBeInTheDocument());
    await waitFor(() => expect(hqService.listOrganizations).toHaveBeenCalledTimes(2));
  });

  it("keeps create failure visible without inserting a fake row", async () => {
    hqService.createOrganization.mockRejectedValueOnce(new Error("Create rejected"));
    renderOrganizations();
    await screen.findByText("Canonical Cafe");
    fireEvent.click(screen.getByRole("button", { name: /^Добавить/ }));
    const dialog = screen.getByRole("dialog", { name: "Добавить организацию" });
    fireEvent.change(within(dialog).getByLabelText("Название"), { target: { value: "Rejected Org" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Create rejected");
    expect(screen.queryByText("Rejected Org", { selector: "td *" })).not.toBeInTheDocument();
  });

  it("restores actual backend values and updates the canonical status association", async () => {
    renderOrganizations();
    await screen.findByText("Canonical Cafe");
    fireEvent.click(screen.getByRole("button", { name: "Редактировать Canonical Cafe" }));
    const dialog = screen.getByRole("dialog", { name: "Редактировать Canonical Cafe" });
    expect(within(dialog).getByLabelText("Название")).toHaveValue("Canonical Cafe");
    expect(within(dialog).getByLabelText("Тип")).toHaveValue("cafe");
    expect(within(dialog).getByLabelText("ИНН")).toHaveValue("309998877");
    expect(within(dialog).getByLabelText("Цена тарифа")).toHaveValue(125000);
    expect(within(dialog).getByLabelText("Статус организации")).toHaveValue(STATUS.id);
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(hqService.updateOrganization).toHaveBeenCalledWith(
      ORGANIZATION.id,
      expect.objectContaining({ name: ORGANIZATION.name, organization_status_id: STATUS.id }),
    ));
  });

  it("preserves the edit modal and prior row on update failure", async () => {
    hqService.updateOrganization.mockRejectedValueOnce(new Error("Update rejected"));
    renderOrganizations();
    await screen.findByText("Canonical Cafe");
    fireEvent.click(screen.getByRole("button", { name: "Редактировать Canonical Cafe" }));
    const dialog = screen.getByRole("dialog", { name: "Редактировать Canonical Cafe" });
    fireEvent.change(within(dialog).getByLabelText("Название"), { target: { value: "Attempted" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Update rejected");
    expect(screen.getByText("Canonical Cafe")).toBeInTheDocument();
  });

  it("blocks through PATCH and archives through canonical soft-delete DELETE", async () => {
    renderOrganizations();
    await screen.findByText("Canonical Cafe");
    fireEvent.click(screen.getByRole("button", { name: "Заблокировать Canonical Cafe" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Заблокировать организацию" })).getByRole("button", { name: "Подтвердить" }));
    await waitFor(() => expect(hqService.updateOrganization).toHaveBeenCalledWith(ORGANIZATION.id, { status: "blocked" }));

    await screen.findByText("Canonical Cafe");
    fireEvent.click(screen.getByRole("button", { name: "Архивировать Canonical Cafe" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Архивировать организацию" })).getByRole("button", { name: "Подтвердить" }));
    await waitFor(() => expect(hqService.archiveOrganization).toHaveBeenCalledWith(ORGANIZATION.id));
  });

  it("keeps lifecycle failure visible and does not refetch fake success", async () => {
    hqService.archiveOrganization.mockRejectedValueOnce(new Error("Archive rejected"));
    renderOrganizations();
    await screen.findByText("Canonical Cafe");
    fireEvent.click(screen.getByRole("button", { name: "Архивировать Canonical Cafe" }));
    const dialog = screen.getByRole("dialog", { name: "Архивировать организацию" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Подтвердить" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Archive rejected");
    expect(hqService.listOrganizations).toHaveBeenCalledTimes(1);
  });

  it("marks organization messaging explicitly unsupported", async () => {
    renderOrganizations();
    const message = await screen.findByRole("button", { name: "Сообщения Canonical Cafe недоступны" });
    expect(message).toBeDisabled();
    expect(message).toHaveAttribute("title", expect.stringContaining("HQ-контракт сообщений отсутствует"));
  });

  it("does not issue generic duplicate or per-row organization requests", async () => {
    render(<CategoryPage active="org-list" search="" onCreate={vi.fn()} onRowDetail={vi.fn()} onNotify={vi.fn()} />);
    await screen.findByText("Canonical Cafe");
    expect(hqService.listOrganizations).toHaveBeenCalledTimes(1);
    expect(hqService.listSection).not.toHaveBeenCalled();
  });
});

describe("HQ-01 organization statuses", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    hqService.listOrganizationStatuses.mockResolvedValue(page([STATUS]));
    hqService.createOrganizationStatus.mockResolvedValue({ data: STATUS });
    hqService.updateOrganizationStatus.mockResolvedValue({ data: STATUS });
    hqService.deleteOrganizationStatus.mockResolvedValue({ data: null });
  });

  it("renders loading, empty, full, and error states", async () => {
    const pending = deferred();
    hqService.listOrganizationStatuses.mockReturnValueOnce(pending.promise);
    const loading = renderStatuses();
    expect(screen.getByText("Загрузка статусов...")).toBeInTheDocument();
    pending.resolve(page([]));
    expect(await screen.findByText("Статусы не найдены.")).toBeInTheDocument();
    loading.unmount();

    hqService.listOrganizationStatuses.mockResolvedValueOnce(page([STATUS]));
    const full = renderStatuses();
    expect(await screen.findByText("Подключена")).toBeInTheDocument();
    full.unmount();

    hqService.listOrganizationStatuses.mockRejectedValueOnce(new Error("Status list rejected"));
    renderStatuses();
    expect(await screen.findByRole("alert")).toHaveTextContent("Status list rejected");
  });

  it("uses canonical server search, status filter, sorting, and pagination", async () => {
    hqService.listOrganizationStatuses.mockImplementation((params) => Promise.resolve(page(
      [{ ...STATUS, id: `status-${params.page}`, name: `Status page ${params.page}` }],
      { total: 40, page: params.page, size: params.size, pages: 2 },
    )));
    renderStatuses();
    await screen.findByText("Status page 1");
    fireEvent.change(screen.getByPlaceholderText("Поиск по названию"), { target: { value: "paid" } });
    fireEvent.change(screen.getByLabelText("Активность статуса"), { target: { value: "true" } });
    fireEvent.click(screen.getByRole("button", { name: "Применить" }));
    await waitFor(() => expect(hqService.listOrganizationStatuses).toHaveBeenLastCalledWith(
      { page: 1, size: 20, sort: "sort", search: "paid", status: "true" },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
    fireEvent.click(screen.getByRole("button", { name: "Следующая страница" }));
    expect(await screen.findByText("Status page 2")).toBeInTheDocument();
  });

  it("creates and edits statuses with canonical payloads", async () => {
    renderStatuses();
    await screen.findByText("Подключена");
    fireEvent.click(screen.getByRole("button", { name: /^Добавить/ }));
    fireEvent.change(screen.getByPlaceholderText("Название статуса"), { target: { value: "Новый статус" } });
    fireEvent.change(screen.getByLabelText("Порядок"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(hqService.createOrganizationStatus).toHaveBeenCalledWith({ name: "Новый статус", sort: 7, status: true }));

    await screen.findByText("Подключена");
    fireEvent.click(screen.getByRole("button", { name: "Редактировать Подключена" }));
    expect(screen.getByPlaceholderText("Название статуса")).toHaveValue("Подключена");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(hqService.updateOrganizationStatus).toHaveBeenCalledWith(STATUS.id, { name: STATUS.name, sort: STATUS.sort, status: true }));
  });

  it("keeps create failure visible and prevents double submit", async () => {
    const create = deferred();
    hqService.createOrganizationStatus.mockReturnValueOnce(create.promise);
    renderStatuses();
    await screen.findByText("Подключена");
    fireEvent.click(screen.getByRole("button", { name: /^Добавить/ }));
    fireEvent.change(screen.getByPlaceholderText("Название статуса"), { target: { value: "Pending" } });
    const save = screen.getByRole("button", { name: "Сохранить" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(hqService.createOrganizationStatus).toHaveBeenCalledTimes(1);
    create.reject(new Error("Status create rejected"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Status create rejected");
  });

  it("keeps the status editor open when canonical edit fails", async () => {
    hqService.updateOrganizationStatus.mockRejectedValueOnce(new Error("Status edit rejected"));
    renderStatuses();
    await screen.findByText("Подключена");
    fireEvent.click(screen.getByRole("button", { name: "Редактировать Подключена" }));
    fireEvent.change(screen.getByPlaceholderText("Название статуса"), { target: { value: "Attempted status" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Status edit rejected");
    expect(screen.getByPlaceholderText("Название статуса")).toHaveValue("Attempted status");
    expect(screen.getByText("Подключена")).toBeInTheDocument();
  });

  it("toggles and hard-deletes a status through canonical mutations", async () => {
    renderStatuses();
    await screen.findByText("Подключена");
    fireEvent.click(screen.getByRole("button", { name: "#активно" }));
    await waitFor(() => expect(hqService.updateOrganizationStatus).toHaveBeenCalledWith(STATUS.id, { status: false }));

    await screen.findByText("Подключена");
    fireEvent.click(screen.getByRole("button", { name: "Удалить Подключена" }));
    const dialog = screen.getByRole("dialog", { name: "Удалить статус" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(hqService.deleteOrganizationStatus).toHaveBeenCalledWith(STATUS.id));
  });

  it("preserves a status and reports canonical mutation failure", async () => {
    hqService.updateOrganizationStatus.mockRejectedValueOnce(new Error("Status update rejected"));
    renderStatuses();
    await screen.findByText("Подключена");
    fireEvent.click(screen.getByRole("button", { name: "#активно" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Status update rejected");
    expect(screen.getByText("Подключена")).toBeInTheDocument();
  });

  it("keeps delete confirmation open when canonical hard delete fails", async () => {
    hqService.deleteOrganizationStatus.mockRejectedValueOnce(new Error("Status delete rejected"));
    renderStatuses();
    await screen.findByText("Подключена");
    fireEvent.click(screen.getByRole("button", { name: "Удалить Подключена" }));
    const dialog = screen.getByRole("dialog", { name: "Удалить статус" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Удалить" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Status delete rejected");
    expect(screen.getAllByText("Подключена").length).toBeGreaterThanOrEqual(2);
  });

  it("does not issue a generic duplicate status request", async () => {
    render(<CategoryPage active="org-status" search="" onCreate={vi.fn()} onRowDetail={vi.fn()} onNotify={vi.fn()} />);
    await screen.findByText("Подключена");
    expect(hqService.listOrganizationStatuses).toHaveBeenCalledTimes(1);
    expect(hqService.listSection).not.toHaveBeenCalled();
  });
});
