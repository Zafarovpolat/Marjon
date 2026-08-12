import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_SCOPES, AUTH_STORAGE_KEYS, endAuthSession, resetAuthSessionStateForTest } from "../auth/session";
import AdminApp, { CategoryPage, StorageInventoryPage, StorageWriteoffPage } from "./AdminApp";
import { adminApi } from "./api";

const adminTransportAdapter = adminApi.defaults.adapter;

vi.mock("chart.js", () => {
  class ChartMock {
    static register = vi.fn();

    destroy() {}
  }

  return {
    Chart: ChartMock,
    CategoryScale: {},
    Filler: {},
    LineController: {},
    LineElement: {},
    LinearScale: {},
    PointElement: {},
    Tooltip: {},
  };
});

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
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
    });
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
