import axios from "axios";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "../admin/api";
import { api, API_BASE_URL, logout } from "../api/client";
import {
  AUTH_STORAGE_KEYS,
  getAuthRefreshPromiseForTest,
  resetAuthSessionStateForTest,
  saveAuthTokens,
} from "./session";

function getHeader(headers, key) {
  return headers?.get?.(key) || headers?.[key] || headers?.[key.toLowerCase()];
}

function resolveResponse(config, data = { ok: true }) {
  return Promise.resolve({
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  });
}

function rejectStatus(config, status) {
  return Promise.reject({
    config,
    message: `Request failed with status code ${status}`,
    response: { status, data: { detail: `status ${status}` } },
  });
}

function rejectNetwork(config) {
  return Promise.reject({
    config,
    message: "Network Error",
    request: {},
  });
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

function mockRefreshSuccess(accessToken = "new-access", refreshToken = "new-refresh") {
  return vi.spyOn(axios, "post").mockResolvedValue({
    data: {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: "bearer",
    },
  });
}

describe("auth session and axios clients", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    resetAuthSessionStateForTest();
    api.defaults.adapter = undefined;
    adminApi.defaults.adapter = undefined;
  });

  it("adds access token to Authorization header", async () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, "access-a");
    const adapter = vi.fn((config) => resolveResponse(config));
    api.defaults.adapter = adapter;

    await api.get("/protected");

    expect(getHeader(adapter.mock.calls[0][0].headers, "Authorization")).toBe("Bearer access-a");
  });

  it("does not add Authorization header when access token is missing", async () => {
    const adapter = vi.fn((config) => resolveResponse(config));
    api.defaults.adapter = adapter;

    await api.get("/public");

    expect(getHeader(adapter.mock.calls[0][0].headers, "Authorization")).toBeUndefined();
  });

  it("logout removes access and refresh tokens", () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, "access-a");
    localStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, "refresh-a");
    localStorage.setItem(AUTH_STORAGE_KEYS.adminAccessToken, "admin-access");
    localStorage.setItem(AUTH_STORAGE_KEYS.adminRefreshToken, "admin-refresh");

    logout();

    expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.adminAccessToken)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.adminRefreshToken)).toBeNull();
  });

  it("saves refreshed token pairs", () => {
    saveAuthTokens({ access_token: "access-b", refresh_token: "refresh-b" });

    expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBe("access-b");
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken)).toBe("refresh-b");
  });

  it("reads existing admin storage keys for adminApi authorization", async () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.adminAccessToken, "admin-access");
    const adapter = vi.fn((config) => resolveResponse(config));
    adminApi.defaults.adapter = adapter;

    await adminApi.get("/admin-reports/dashboard-kpis");

    expect(getHeader(adapter.mock.calls[0][0].headers, "Authorization")).toBe("Bearer admin-access");
  });

  it("one 401 starts one refresh and retries the original request", async () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, "old-access");
    localStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, "old-refresh");
    const refresh = mockRefreshSuccess("new-access", "new-refresh");
    const adapter = vi.fn((config) => (
      config._authRetry ? resolveResponse(config, { retried: true }) : rejectStatus(config, 401)
    ));
    api.defaults.adapter = adapter;

    const response = await api.get("/resource");

    expect(response.data).toEqual({ retried: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(`${API_BASE_URL}/auth/refresh`, { refresh_token: "old-refresh" }, expect.any(Object));
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(getHeader(adapter.mock.calls[1][0].headers, "Authorization")).toBe("Bearer new-access");
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBe("new-access");
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken)).toBe("new-refresh");
  });

  it("does not refresh again when the retried request also returns 401", async () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, "old-access");
    localStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, "old-refresh");
    const refresh = mockRefreshSuccess();
    api.defaults.adapter = vi.fn((config) => rejectStatus(config, 401));

    await expect(api.get("/resource")).rejects.toMatchObject({ response: { status: 401 } });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken)).toBeNull();
  });

  it("ends the session without refresh when refresh token is missing", async () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, "old-access");
    const refresh = vi.spyOn(axios, "post");
    api.defaults.adapter = vi.fn((config) => rejectStatus(config, 401));

    await expect(api.get("/resource")).rejects.toThrow("missing_refresh_token");

    expect(refresh).not.toHaveBeenCalled();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBeNull();
  });

  it("clears the session when refresh fails", async () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, "old-access");
    localStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, "old-refresh");
    vi.spyOn(axios, "post").mockRejectedValue({ response: { status: 401 } });
    api.defaults.adapter = vi.fn((config) => rejectStatus(config, 401));

    await expect(api.get("/resource")).rejects.toMatchObject({ response: { status: 401 } });

    expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken)).toBeNull();
  });

  it("clears the session when refresh response is invalid", async () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, "old-access");
    localStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, "old-refresh");
    vi.spyOn(axios, "post").mockResolvedValue({ data: { access_token: "new-access" } });
    api.defaults.adapter = vi.fn((config) => rejectStatus(config, 401));

    await expect(api.get("/resource")).rejects.toThrow("invalid_refresh_response");

    expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken)).toBeNull();
  });

  it.each(["/auth/login", "/auth/pin-login", "/auth/refresh"])("does not refresh auth endpoint %s", async (url) => {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, "old-access");
    localStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, "old-refresh");
    const refresh = vi.spyOn(axios, "post");
    api.defaults.adapter = vi.fn((config) => rejectStatus(config, 401));

    await expect(api.post(url, {})).rejects.toMatchObject({ response: { status: 401 } });

    expect(refresh).not.toHaveBeenCalled();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBe("old-access");
  });

  it.each([403, 404, 409, 422, 500])("does not refresh status %s", async (status) => {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, "old-access");
    localStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, "old-refresh");
    const refresh = vi.spyOn(axios, "post");
    api.defaults.adapter = vi.fn((config) => rejectStatus(config, status));

    await expect(api.get("/resource")).rejects.toMatchObject({ response: { status } });

    expect(refresh).not.toHaveBeenCalled();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBe("old-access");
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken)).toBe("old-refresh");
  });

  it("does not refresh or logout on network errors without HTTP status", async () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, "old-access");
    localStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, "old-refresh");
    const refresh = vi.spyOn(axios, "post");
    api.defaults.adapter = vi.fn((config) => rejectNetwork(config));

    await expect(api.get("/resource")).rejects.toMatchObject({ message: "Network Error" });

    expect(refresh).not.toHaveBeenCalled();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)).toBe("old-access");
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken)).toBe("old-refresh");
  });

  it("single-flights five concurrent 401 responses and retries all requests after success", async () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, "old-access");
    localStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, "old-refresh");
    const pendingRefresh = deferred();
    const refresh = vi.spyOn(axios, "post").mockReturnValue(pendingRefresh.promise);
    const adapter = vi.fn((config) => (
      config._authRetry ? resolveResponse(config, { url: config.url }) : rejectStatus(config, 401)
    ));
    api.defaults.adapter = adapter;

    const requests = Array.from({ length: 5 }, (_, index) => api.get(`/resource-${index}`));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(getAuthRefreshPromiseForTest()).not.toBeNull();

    pendingRefresh.resolve({ data: { access_token: "new-access", refresh_token: "new-refresh" } });
    const responses = await Promise.all(requests);

    expect(responses).toHaveLength(5);
    expect(adapter).toHaveBeenCalledTimes(10);
    expect(adapter.mock.calls.slice(5).every(([config]) => getHeader(config.headers, "Authorization") === "Bearer new-access")).toBe(true);
    expect(getAuthRefreshPromiseForTest()).toBeNull();
  });

  it("single-flights concurrent 401 responses from api and adminApi", async () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, "old-access");
    localStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, "old-refresh");
    const refresh = mockRefreshSuccess("new-access", "new-refresh");
    api.defaults.adapter = vi.fn((config) => (
      config._authRetry ? resolveResponse(config, { client: "api" }) : rejectStatus(config, 401)
    ));
    adminApi.defaults.adapter = vi.fn((config) => (
      config._authRetry ? resolveResponse(config, { client: "admin" }) : rejectStatus(config, 401)
    ));

    const [apiResponse, adminResponse] = await Promise.all([
      api.get("/resource"),
      adminApi.get("/admin-resource"),
    ]);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(apiResponse.data).toEqual({ client: "api" });
    expect(adminResponse.data).toEqual({ client: "admin" });
  });

  it("settles all waiting requests and clears refresh state after refresh failure", async () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, "old-access");
    localStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, "old-refresh");
    const pendingRefresh = deferred();
    vi.spyOn(axios, "post").mockReturnValue(pendingRefresh.promise);
    const sessionEnded = vi.fn();
    window.addEventListener("marjon:auth-session-ended", sessionEnded);
    api.defaults.adapter = vi.fn((config) => rejectStatus(config, 401));

    const requests = Array.from({ length: 5 }, (_, index) => api.get(`/resource-${index}`));
    await waitFor(() => expect(getAuthRefreshPromiseForTest()).not.toBeNull());
    pendingRefresh.reject({ response: { status: 401 } });
    const results = await Promise.allSettled(requests);

    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(sessionEnded).toHaveBeenCalledTimes(1);
    expect(getAuthRefreshPromiseForTest()).toBeNull();
    window.removeEventListener("marjon:auth-session-ended", sessionEnded);
  });
});
