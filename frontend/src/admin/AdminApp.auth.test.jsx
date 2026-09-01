import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_SCOPES, AUTH_STORAGE_KEYS, endAuthSession, resetAuthSessionStateForTest } from "../auth/session";
import AdminApp, { CategoryPage, normalizeAdminProduct, StorageInventoryPage, StorageWriteoffPage } from "./AdminApp";
import { adminApi } from "./api";

const adminTransportAdapter = adminApi.defaults.adapter;

const validHqProfile = {
  id: "hq-user",
  email: "hq@marjon.test",
  name: "HQ User",
  phone: "+998900000000",
  is_active: true,
  is_superadmin: true,
  company_id: null,
  role_slugs: [],
  auth_scope: "hq_admin",
};

function setAppTokens() {
  localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, "app-access");
  localStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, "app-refresh");
}

function setAdminTokens() {
  localStorage.setItem(AUTH_STORAGE_KEYS.adminAccessToken, "admin-access");
  localStorage.setItem(AUTH_STORAGE_KEYS.adminRefreshToken, "admin-refresh");
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function resolveAdminGet(path) {
  if (path === "/auth/me") return Promise.resolve({ data: validHqProfile });
  return Promise.resolve({ data: [] });
}

function rejectStatus(config, status) {
  return Promise.reject({
    config,
    message: `Request failed with status code ${status}`,
    response: { status, data: { detail: `status ${status}` } },
  });
}

describe("AdminApp HQ session gate", () => {
  beforeEach(() => {
    localStorage.clear();
    resetAuthSessionStateForTest();
    adminApi.defaults.adapter = adminTransportAdapter;
  });

  it("does not treat an existing APP session as an authenticated HQ session", () => {
    setAppTokens();
    const get = vi.spyOn(adminApi, "get");

    const { container } = render(<AdminApp />);

    expect(container.querySelector(".admin-shell")).not.toBeInTheDocument();
    expect(container.querySelector(".admin-login")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Войти" })).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it("does not render the shell until /auth/me validates the HQ session", async () => {
    setAdminTokens();
    const profile = deferred();
    const get = vi.spyOn(adminApi, "get").mockImplementation((path) => {
      if (path === "/auth/me") return profile.promise;
      return Promise.resolve({ data: [] });
    });

    const { container } = render(<AdminApp />);

    expect(container.querySelector(".admin-shell")).not.toBeInTheDocument();
    expect(container.querySelector(".admin-login")).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/auth/me");

    profile.resolve({ data: validHqProfile });

    await waitFor(() => expect(container.querySelector(".admin-shell")).toBeInTheDocument());
    expect(get.mock.calls[0]).toEqual(["/auth/me"]);
  });

  it("keeps the dashboard on truthful HQ transactions without legacy KPI requests", async () => {
    setAdminTokens();
    const get = vi.spyOn(adminApi, "get").mockImplementation(resolveAdminGet);

    const { container } = render(<AdminApp />);
    await waitFor(() => expect(container.querySelector(".admin-shell")).toBeInTheDocument());
    await waitFor(() => {
      expect(get.mock.calls.filter(([path]) => path === "/hq/finance/transactions")).toHaveLength(1);
    });
    expect(screen.getByRole("heading", { name: "Дашборд" })).toBeInTheDocument();
    expect(container.querySelector(".admin-chart-card")).not.toBeInTheDocument();
    expect(get.mock.calls.filter(([path]) => path === "/organizations")).toHaveLength(0);
    expect(get.mock.calls.filter(([path]) => path === "/admin-reports/dashboard-kpis")).toHaveLength(0);

    const handbookToggle = container.querySelectorAll(".admin-nav-group__toggle")[3];
    fireEvent.click(handbookToggle);
    fireEvent.click(container.querySelector(".admin-nav-group.is-open .admin-nav-sub__item"));
    fireEvent.click(container.querySelector(".admin-nav > button"));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Дашборд" })).toBeInTheDocument());
    expect(get.mock.calls.filter(([path]) => path === "/organizations")).toHaveLength(0);
    expect(get.mock.calls.filter(([path]) => path === "/admin-reports/dashboard-kpis")).toHaveLength(0);
  });

  it.each([
    ["401", { response: { status: 401 } }],
    ["network failure", { message: "Network Error", request: {} }],
  ])("clears only ADMIN and renders HQ login when /auth/me has %s", async (_case, error) => {
    setAppTokens();
    setAdminTokens();
    vi.spyOn(adminApi, "get").mockRejectedValue(error);

    const { container } = render(<AdminApp />);

    await waitFor(() => expect(container.querySelector(".admin-login")).toBeInTheDocument());
    expect(container.querySelector(".admin-shell")).not.toBeInTheDocument();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.adminAccessToken)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.adminRefreshToken)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBe("app-access");
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken)).toBe("app-refresh");
  });

  it.each([
    ["wrong auth scope", { ...validHqProfile, auth_scope: "app" }],
    ["lost superadmin privilege", { ...validHqProfile, is_superadmin: false }],
  ])("denies an otherwise authenticated profile with %s", async (_case, profile) => {
    setAppTokens();
    setAdminTokens();
    vi.spyOn(adminApi, "get").mockResolvedValue({ data: profile });

    const { container } = render(<AdminApp />);

    await waitFor(() => expect(container.querySelector(".admin-login")).toBeInTheDocument());
    expect(container.querySelector(".admin-shell")).not.toBeInTheDocument();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.adminAccessToken)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBe("app-access");
  });

  it("tears down the shell on an ADMIN session-ended event without touching APP", async () => {
    setAppTokens();
    setAdminTokens();
    vi.spyOn(adminApi, "get").mockImplementation(resolveAdminGet);

    const { container } = render(<AdminApp />);
    await waitFor(() => expect(container.querySelector(".admin-shell")).toBeInTheDocument());

    act(() => {
      endAuthSession("refresh_failed", { scope: AUTH_SCOPES.ADMIN });
    });

    await waitFor(() => expect(container.querySelector(".admin-login")).toBeInTheDocument());
    expect(container.querySelector(".admin-shell")).not.toBeInTheDocument();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.adminAccessToken)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBe("app-access");
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken)).toBe("app-refresh");
  });

  it("uses current-session backend logout, renders HQ login, and preserves APP", async () => {
    setAppTokens();
    setAdminTokens();
    vi.spyOn(adminApi, "get").mockImplementation(resolveAdminGet);
    const post = vi.spyOn(adminApi, "post").mockResolvedValue({ status: 204, data: "" });

    const { container } = render(<AdminApp />);
    await waitFor(() => expect(container.querySelector(".admin-shell")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Профиль администратора" }));
    fireEvent.click(screen.getByRole("button", { name: "Выйти" }));

    await waitFor(() => expect(post).toHaveBeenCalledWith(
      "/auth/logout",
      { refresh_token: "admin-refresh" },
      { headers: { Authorization: "Bearer admin-access" } },
    ));
    await waitFor(() => expect(container.querySelector(".admin-login")).toBeInTheDocument());
    expect(container.querySelector(".admin-shell")).not.toBeInTheDocument();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.adminAccessToken)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.adminRefreshToken)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBe("app-access");
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken)).toBe("app-refresh");
  });

  it("tears down the shell when an ADMIN 403 revalidation proves privilege loss", async () => {
    setAppTokens();
    setAdminTokens();
    const get = vi.spyOn(adminApi, "get").mockImplementation(resolveAdminGet);

    const { container } = render(<AdminApp />);
    await waitFor(() => expect(container.querySelector(".admin-shell")).toBeInTheDocument());

    get.mockRestore();
    vi.spyOn(axios, "get").mockResolvedValue({
      data: { ...validHqProfile, is_superadmin: false },
    });
    adminApi.defaults.adapter = vi.fn((config) => rejectStatus(config, 403));

    await act(async () => {
      await expect(adminApi.get("/organizations")).rejects.toMatchObject({
        response: { status: 403 },
      });
    });

    await waitFor(() => expect(container.querySelector(".admin-login")).toBeInTheDocument());
    expect(container.querySelector(".admin-shell")).not.toBeInTheDocument();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.adminAccessToken)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.adminRefreshToken)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBe("app-access");
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken)).toBe("app-refresh");
  });

  it.each([
    [StorageWriteoffPage, "Документы списания недоступны"],
    [StorageInventoryPage, "Инвентаризация недоступна"],
  ])("keeps deferred HQ storage page %p explicit and request-free", async (Page, message) => {
    const get = vi.spyOn(adminApi, "get");

    render(<Page search="" onNotify={vi.fn()} onInnerBackChange={vi.fn()} />);

    expect(await screen.findByRole("status")).toHaveTextContent(message);
    expect(get).not.toHaveBeenCalled();
    expect(screen.queryByText("Список пуст")).not.toBeInTheDocument();
    expect(screen.queryByText("Инвентаризации не найдены.")).not.toBeInTheDocument();
  });

  it.each([
    ["storage-income", "Данные прихода недоступны"],
    ["storage-expense", "Данные расхода недоступны"],
    ["storage-balance", "Остатки недоступны"],
    ["storage-income-journal", "Журнал прихода недоступен"],
    ["storage-writeoff", "Документы списания недоступны"],
    ["storage-inventory", "Инвентаризация недоступна"],
  ])("keeps deferred HQ storage route %s request-free", async (active, message) => {
    const get = vi.spyOn(adminApi, "get");

    render(
      <CategoryPage
        active={active}
        search=""
        onCreate={vi.fn()}
        onRowDetail={vi.fn()}
        onNotify={vi.fn()}
        onInnerBackChange={vi.fn()}
      />,
    );

    expect(await screen.findByRole("status")).toHaveTextContent(message);
    expect(get).not.toHaveBeenCalled();
  });

  it("does not invent a warehouse for a backend HQ product", () => {
    const product = normalizeAdminProduct({
      id: "product-uuid",
      name: "Backend product",
      category_id: null,
      price: 125000,
      unit_id: null,
      status: true,
      is_used: false,
      is_archived: false,
    });

    expect(product).toMatchObject({ id: "product-uuid", name: "Backend product", price: 125000 });
    expect(product).not.toHaveProperty("warehouse");
    expect(product).not.toHaveProperty("storage_name");
    expect(JSON.stringify(product)).not.toContain("Главный склад");
  });

  it("renders null HQ identity with neutral placeholders", async () => {
    setAdminTokens();
    vi.spyOn(adminApi, "get").mockImplementation((path) => (
      path === "/auth/me"
        ? Promise.resolve({ data: { ...validHqProfile, name: null, phone: null } })
        : Promise.resolve({ data: [] })
    ));

    const { container } = render(<AdminApp />);
    await waitFor(() => expect(container.querySelector(".admin-shell")).toBeInTheDocument());

    expect(container.querySelector(".admin-profile__meta strong")).toHaveTextContent("Не указано");
    expect(container.querySelector(".admin-profile-card__info strong")).toHaveTextContent("Не указано");
    expect(screen.queryByText("Александр П.")).not.toBeInTheDocument();
    expect(screen.queryByText("900000777")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Профиль администратора" }));
    expect(screen.getByText("Телефон").closest("div")).toHaveTextContent("—");
  });

  it("renders server-provided HQ identity unchanged", async () => {
    setAdminTokens();
    vi.spyOn(adminApi, "get").mockImplementation(resolveAdminGet);

    const { container } = render(<AdminApp />);
    await waitFor(() => expect(container.querySelector(".admin-shell")).toBeInTheDocument());

    expect(container.querySelector(".admin-profile__meta strong")).toHaveTextContent("HQ User");
    fireEvent.click(screen.getByRole("button", { name: "Профиль администратора" }));
    expect(screen.getByText("Телефон").closest("div")).toHaveTextContent("+998900000000");
  });

  it("does not call an APP-only debt-credit report from HQ bank statistics", async () => {
    const get = vi.spyOn(adminApi, "get");

    render(
      <CategoryPage
        active="bank-stats"
        search=""
        onCreate={vi.fn()}
        onRowDetail={vi.fn()}
        onNotify={vi.fn()}
        onInnerBackChange={vi.fn()}
      />,
    );

    expect(await screen.findByRole("status")).toHaveTextContent("Backend источник не подключён.");
    expect(get).not.toHaveBeenCalled();
  });
});
