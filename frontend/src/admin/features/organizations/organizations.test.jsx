import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CategoryPage } from "../../AdminSectionRouter";
import {
  OrganizationDirectoryPage,
  normalizeOrganization,
  normalizeOrganizationStatus,
} from "./OrganizationDirectoryPage";
import { OrganizationStatusPage } from "./OrganizationStatusPage";
import { organizationsApi } from "./organizationsApi";

vi.mock("./organizationsApi", () => ({
  organizationsApi: {
    listOrganizations: vi.fn(),
    listOrganizationStatuses: vi.fn(),
    listCountries: vi.fn(),
    listRegions: vi.fn(),
    listDistricts: vi.fn(),
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
  is_main: false,
  tariff_price: "125000.00",
  working_days: 24,
  virtual_cash_register_number: null,
  virtual_cash_register_ip_address: null,
  country_id: null,
  region_id: null,
  district_id: null,
  tin: "309998877",
  installation_date: "2026-08-15",
  organization_status_id: STATUS.id,
  status: "active",
  online_menu: true,
  enabled_storage_integration: false,
  is_solvent: true,
  is_billing_autoblock: false,
  is_face_detection_required: false,
  taplink: null,
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
    organizationsApi.listOrganizations.mockResolvedValue(page([ORGANIZATION]));
    organizationsApi.listOrganizationStatuses.mockResolvedValue(page([STATUS]));
    organizationsApi.listCountries.mockResolvedValue(page([]));
    organizationsApi.listRegions.mockResolvedValue(page([]));
    organizationsApi.listDistricts.mockResolvedValue(page([]));
    organizationsApi.createOrganization.mockResolvedValue({ data: ORGANIZATION });
    organizationsApi.updateOrganization.mockResolvedValue({ data: ORGANIZATION });
    organizationsApi.archiveOrganization.mockResolvedValue({ data: null });
  });

  it("renders loading, empty, full, and error states truthfully", async () => {
    const pending = deferred();
    organizationsApi.listOrganizations.mockReturnValueOnce(pending.promise);
    const view = renderOrganizations();
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("Загрузка организаций");
    pending.resolve(page([]));
    expect(await screen.findByText("Организации не найдены.")).toBeInTheDocument();
    view.unmount();

    organizationsApi.listOrganizations.mockResolvedValueOnce(page([ORGANIZATION]));
    const full = renderOrganizations();
    expect(await screen.findByText("Canonical Cafe")).toBeInTheDocument();
    full.unmount();

    organizationsApi.listOrganizations.mockRejectedValueOnce(new Error("Canonical failure"));
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

  it("rejects organization and status rows without canonical identifiers", () => {
    expect(() => normalizeOrganization({ ...ORGANIZATION, id: "" })).toThrow("id is required");
    expect(() => normalizeOrganizationStatus({ ...STATUS, id: "" })).toThrow("id is required");
  });

  it("turns an invalid paginated contract into a truthful load error", async () => {
    organizationsApi.listOrganizations.mockResolvedValueOnce({ data: { items: null, total: 0, page: 1, size: 20, pages: 1 } });
    renderOrganizations();
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить организации.");
  });

  it("renders the canonical linked organization status", async () => {
    renderOrganizations();
    expect((await screen.findAllByText("Подключена")).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Доступен")).not.toBeInTheDocument();
  });

  it("uses server metadata and sends canonical pagination", async () => {
    organizationsApi.listOrganizations.mockImplementation((params) => Promise.resolve(page(
      [{ ...ORGANIZATION, id: `org-${params.page}`, name: `Page ${params.page}` }],
      { total: 45, page: params.page, size: params.size, pages: 3 },
    )));
    renderOrganizations();
    expect(await screen.findByText("Page 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Следующая страница" }));
    expect(await screen.findByText("Page 2")).toBeInTheDocument();
    expect(organizationsApi.listOrganizations).toHaveBeenLastCalledWith(
      { page: 2, size: 20 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByText("21-21 из 45")).toBeInTheDocument();
  });

  it("applies backend-supported search and filters and shows no-results", async () => {
    organizationsApi.listOrganizations.mockResolvedValueOnce(page([ORGANIZATION])).mockResolvedValueOnce(page([]));
    renderOrganizations();
    await screen.findByText("Canonical Cafe");
    fireEvent.change(screen.getByPlaceholderText("Поиск по названию или ИНН"), { target: { value: "needle" } });
    fireEvent.change(screen.getByLabelText("Состояние организации"), { target: { value: "blocked" } });
    fireEvent.change(screen.getByLabelText("Статус организации"), { target: { value: STATUS.id } });
    fireEvent.click(screen.getByRole("button", { name: "Применить" }));

    expect(await screen.findByText("По заданным условиям организации не найдены.")).toBeInTheDocument();
    expect(organizationsApi.listOrganizations).toHaveBeenLastCalledWith(
      { page: 1, size: 20, search: "needle", status: "blocked", organization_status_id: STATUS.id },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("creates once, protects against double submit, and canonically refetches", async () => {
    const create = deferred();
    organizationsApi.createOrganization.mockReturnValueOnce(create.promise);
    renderOrganizations();
    await screen.findByText("Canonical Cafe");
    fireEvent.click(screen.getByRole("button", { name: /^Добавить/ }));
    const dialog = screen.getByRole("dialog", { name: "Добавить организацию" });
    fireEvent.change(within(dialog).getByLabelText("Название"), { target: { value: "Created Org" } });
    const save = within(dialog).getByRole("button", { name: "Сохранить" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(organizationsApi.createOrganization).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole("button", { name: "Сохранение..." })).toBeDisabled();
    create.resolve({ data: { ...ORGANIZATION, name: "Created Org" } });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Добавить организацию" })).not.toBeInTheDocument());
    await waitFor(() => expect(organizationsApi.listOrganizations).toHaveBeenCalledTimes(2));
  });

  it("keeps create failure visible without inserting a fake row", async () => {
    organizationsApi.createOrganization.mockRejectedValueOnce(new Error("Create rejected"));
    renderOrganizations();
    await screen.findByText("Canonical Cafe");
    fireEvent.click(screen.getByRole("button", { name: /^Добавить/ }));
    const dialog = screen.getByRole("dialog", { name: "Добавить организацию" });
    fireEvent.change(within(dialog).getByLabelText("Название"), { target: { value: "Rejected Org" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Create rejected");
    expect(screen.queryByText("Rejected Org", { selector: "td *" })).not.toBeInTheDocument();
  });

  it("shows a safe backend validation message for a rejected create", async () => {
    organizationsApi.createOrganization.mockRejectedValueOnce({
      detail: [{ loc: ["body", "name"], msg: "Организация с таким названием уже существует", input: "hidden" }],
    });
    renderOrganizations();
    await screen.findByText("Canonical Cafe");
    fireEvent.click(screen.getByRole("button", { name: /^Добавить/ }));
    const dialog = screen.getByRole("dialog", { name: "Добавить организацию" });
    fireEvent.change(within(dialog).getByLabelText("Название"), { target: { value: "Duplicate" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Организация с таким названием уже существует");
    expect(within(dialog).getByRole("alert")).not.toHaveTextContent("hidden");
  });

  it("keeps the page usable when column preferences cannot be persisted", async () => {
    const storageWrite = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    try {
      renderOrganizations();
      expect(await screen.findByText("Canonical Cafe")).toBeInTheDocument();
    } finally {
      storageWrite.mockRestore();
    }
  });

  it("restores actual backend values and updates the canonical status association", async () => {
    renderOrganizations();
    await screen.findByText("Canonical Cafe");
    fireEvent.click(screen.getByRole("button", { name: "Редактировать Canonical Cafe" }));
    expect(screen.getByRole("heading", { name: "Изменить организацию" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Название/)).toHaveValue("Canonical Cafe");
    expect(screen.getByLabelText(/Тип филиала/)).toHaveValue("regular");
    expect(screen.getByLabelText("ИНН организации")).toHaveValue("309998877");
    expect(screen.getByLabelText("Цена тарифа")).toHaveValue(125000);
    expect(screen.getByLabelText("Статус организации")).toHaveValue(STATUS.id);
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(organizationsApi.updateOrganization).toHaveBeenCalledWith(
      ORGANIZATION.id,
      expect.objectContaining({ name: ORGANIZATION.name, is_main: false, organization_status_id: STATUS.id }),
    ));
    expect(organizationsApi.updateOrganization.mock.calls.at(-1)[1]).not.toHaveProperty("type");
  });

  it("preserves the full-page editor and canonical values on update failure", async () => {
    organizationsApi.updateOrganization.mockRejectedValueOnce(new Error("Update rejected"));
    renderOrganizations();
    await screen.findByText("Canonical Cafe");
    fireEvent.click(screen.getByRole("button", { name: "Редактировать Canonical Cafe" }));
    fireEvent.change(screen.getByLabelText(/Название/), { target: { value: "Attempted" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Update rejected");
    expect(screen.getByLabelText(/Название/)).toHaveValue("Attempted");
    expect(screen.getByRole("heading", { name: "Изменить организацию" })).toBeInTheDocument();
  });

  it("blocks through PATCH and archives through canonical soft-delete DELETE", async () => {
    renderOrganizations();
    await screen.findByText("Canonical Cafe");
    fireEvent.click(screen.getByRole("button", { name: "Заблокировать Canonical Cafe" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Заблокировать организацию" })).getByRole("button", { name: "Подтвердить" }));
    await waitFor(() => expect(organizationsApi.updateOrganization).toHaveBeenCalledWith(ORGANIZATION.id, { status: "blocked" }));

    await screen.findByText("Canonical Cafe");
    fireEvent.click(screen.getByRole("button", { name: "Архивировать Canonical Cafe" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Архивировать организацию" })).getByRole("button", { name: "Подтвердить" }));
    await waitFor(() => expect(organizationsApi.archiveOrganization).toHaveBeenCalledWith(ORGANIZATION.id));
  });

  it("keeps lifecycle failure visible and does not refetch fake success", async () => {
    organizationsApi.archiveOrganization.mockRejectedValueOnce(new Error("Archive rejected"));
    renderOrganizations();
    await screen.findByText("Canonical Cafe");
    fireEvent.click(screen.getByRole("button", { name: "Архивировать Canonical Cafe" }));
    const dialog = screen.getByRole("dialog", { name: "Архивировать организацию" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Подтвердить" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Archive rejected");
    expect(organizationsApi.listOrganizations).toHaveBeenCalledTimes(1);
  });

  it("opens the legacy message workspace but keeps unsupported sending disabled", async () => {
    renderOrganizations();
    const message = await screen.findByRole("button", { name: "Открыть сообщения Canonical Cafe" });
    fireEvent.click(message);
    expect(screen.getByRole("heading", { name: "Сообщение: Canonical Cafe" })).toBeInTheDocument();
    expect(screen.getByLabelText("Сообщение недоступно")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Send/ })).toBeDisabled();
    expect(screen.getByText(/канонический HQ-контракт сообщений ещё не подключён/)).toBeInTheDocument();
  });

  it("does not issue generic duplicate or per-row organization requests", async () => {
    render(<CategoryPage active="org-list" search="" onCreate={vi.fn()} onRowDetail={vi.fn()} onNotify={vi.fn()} />);
    await screen.findByText("Canonical Cafe");
    expect(organizationsApi.listOrganizations).toHaveBeenCalledTimes(1);
  });
});

describe("HQ-01 organization statuses", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    organizationsApi.listOrganizationStatuses.mockResolvedValue(page([STATUS]));
    organizationsApi.createOrganizationStatus.mockResolvedValue({ data: STATUS });
    organizationsApi.updateOrganizationStatus.mockResolvedValue({ data: STATUS });
    organizationsApi.deleteOrganizationStatus.mockResolvedValue({ data: null });
  });

  it("renders loading, empty, full, and error states", async () => {
    const pending = deferred();
    organizationsApi.listOrganizationStatuses.mockReturnValueOnce(pending.promise);
    const loading = renderStatuses();
    expect(screen.getByText("Загрузка статусов...")).toBeInTheDocument();
    pending.resolve(page([]));
    expect(await screen.findByText("Статусы не найдены.")).toBeInTheDocument();
    loading.unmount();

    organizationsApi.listOrganizationStatuses.mockResolvedValueOnce(page([STATUS]));
    const full = renderStatuses();
    expect(await screen.findByText("Подключена")).toBeInTheDocument();
    full.unmount();

    organizationsApi.listOrganizationStatuses.mockRejectedValueOnce(new Error("Status list rejected"));
    renderStatuses();
    expect(await screen.findByRole("alert")).toHaveTextContent("Status list rejected");
  });

  it("rejects a malformed canonical status page", async () => {
    organizationsApi.listOrganizationStatuses.mockResolvedValueOnce(page([{ ...STATUS, status: "true" }]));
    renderStatuses();
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить статусы организаций.");
  });

  it("uses canonical server search, status filter, sorting, and pagination", async () => {
    organizationsApi.listOrganizationStatuses.mockImplementation((params) => Promise.resolve(page(
      [{ ...STATUS, id: `status-${params.page}`, name: `Status page ${params.page}` }],
      { total: 40, page: params.page, size: params.size, pages: 2 },
    )));
    renderStatuses();
    await screen.findByText("Status page 1");
    fireEvent.change(screen.getByPlaceholderText("Поиск по названию"), { target: { value: "paid" } });
    fireEvent.change(screen.getByLabelText("Активность статуса"), { target: { value: "true" } });
    fireEvent.click(screen.getByRole("button", { name: "Применить" }));
    await waitFor(() => expect(organizationsApi.listOrganizationStatuses).toHaveBeenLastCalledWith(
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
    await waitFor(() => expect(organizationsApi.createOrganizationStatus).toHaveBeenCalledWith({ name: "Новый статус", sort: 7, status: true }));

    await screen.findByText("Подключена");
    fireEvent.click(screen.getByRole("button", { name: "Редактировать Подключена" }));
    expect(screen.getByPlaceholderText("Название статуса")).toHaveValue("Подключена");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(organizationsApi.updateOrganizationStatus).toHaveBeenCalledWith(STATUS.id, { name: STATUS.name, sort: STATUS.sort, status: true }));
  });

  it("keeps create failure visible and prevents double submit", async () => {
    const create = deferred();
    organizationsApi.createOrganizationStatus.mockReturnValueOnce(create.promise);
    renderStatuses();
    await screen.findByText("Подключена");
    fireEvent.click(screen.getByRole("button", { name: /^Добавить/ }));
    fireEvent.change(screen.getByPlaceholderText("Название статуса"), { target: { value: "Pending" } });
    const save = screen.getByRole("button", { name: "Сохранить" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(organizationsApi.createOrganizationStatus).toHaveBeenCalledTimes(1);
    create.reject(new Error("Status create rejected"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Status create rejected");
  });

  it("keeps the status editor open when canonical edit fails", async () => {
    organizationsApi.updateOrganizationStatus.mockRejectedValueOnce(new Error("Status edit rejected"));
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
    await waitFor(() => expect(organizationsApi.updateOrganizationStatus).toHaveBeenCalledWith(STATUS.id, { status: false }));

    await screen.findByText("Подключена");
    fireEvent.click(screen.getByRole("button", { name: "Удалить Подключена" }));
    const dialog = screen.getByRole("dialog", { name: "Удалить статус" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(organizationsApi.deleteOrganizationStatus).toHaveBeenCalledWith(STATUS.id));
  });

  it("preserves a status and reports canonical mutation failure", async () => {
    organizationsApi.updateOrganizationStatus.mockRejectedValueOnce(new Error("Status update rejected"));
    renderStatuses();
    await screen.findByText("Подключена");
    fireEvent.click(screen.getByRole("button", { name: "#активно" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Status update rejected");
    expect(screen.getByText("Подключена")).toBeInTheDocument();
  });

  it("keeps delete confirmation open when canonical hard delete fails", async () => {
    organizationsApi.deleteOrganizationStatus.mockRejectedValueOnce(new Error("Status delete rejected"));
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
    expect(organizationsApi.listOrganizationStatuses).toHaveBeenCalledTimes(1);
  });
});
