import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_SCOPES,
  AUTH_STORAGE_KEYS,
  resetAuthSessionStateForTest,
} from "../auth/session";
import { normalizeApiError } from "./errors";
import {
  ApiContractError,
  normalizePaginatedList,
  normalizeProfileResponse,
  normalizeTokenResponse,
} from "./normalizers";
import { createApiTransport } from "./transport";

function successfulAdapter() {
  return vi.fn(async (config) => ({
    data: { ok: true },
    status: 200,
    statusText: "OK",
    headers: {},
    config,
    request: null,
  }));
}

function httpError(status, data = {}) {
  return { response: { status, data } };
}

function expectNormalizedErrorToExclude(error, marker) {
  expect(JSON.stringify(normalizeApiError(error))).not.toContain(marker);
}

afterEach(() => {
  resetAuthSessionStateForTest();
});

describe("createApiTransport", () => {
  it("uses only the default access token for a default-scoped client", async () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, "default-access-for-test");
    localStorage.setItem(AUTH_STORAGE_KEYS.adminAccessToken, "admin-access-for-test");
    const adapter = successfulAdapter();
    const client = createApiTransport({ baseURL: "https://api.marjon.test", scope: AUTH_SCOPES.DEFAULT, adapter });

    await client.get("/resource");

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(adapter.mock.calls[0][0].headers.get("Authorization")).toBe("Bearer default-access-for-test");
    expect(adapter.mock.calls[0][0]._authScope).toBe(AUTH_SCOPES.DEFAULT);
  });

  it("uses only the admin access token for an admin-scoped client", async () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, "default-access-for-test");
    localStorage.setItem(AUTH_STORAGE_KEYS.adminAccessToken, "admin-access-for-test");
    const adapter = successfulAdapter();
    const client = createApiTransport({ baseURL: "https://admin.marjon.test", scope: AUTH_SCOPES.ADMIN, adapter });

    await client.get("/resource");

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(adapter.mock.calls[0][0].headers.get("Authorization")).toBe("Bearer admin-access-for-test");
    expect(adapter.mock.calls[0][0]._authScope).toBe(AUTH_SCOPES.ADMIN);
  });

  it("rejects an omitted or cleanup-only auth scope", () => {
    expect(() => createApiTransport({ baseURL: "/api" })).toThrow(TypeError);
    expect(() => createApiTransport({ baseURL: "/api", scope: AUTH_SCOPES.ALL })).toThrow(TypeError);
  });
});

describe("normalizeApiError", () => {
  it("normalizes a network error", () => {
    const normalized = normalizeApiError({ code: "ERR_NETWORK", message: "Network Error", request: {} });

    expect(normalized).toMatchObject({ kind: "network", status: null, isNetworkError: true });
  });

  it("normalizes a timeout", () => {
    const normalized = normalizeApiError({ code: "ECONNABORTED", message: "timeout exceeded" });

    expect(normalized).toMatchObject({ kind: "timeout", isTimeout: true, isNetworkError: false });
  });

  it.each([
    { code: "ERR_CANCELED" },
    { name: "CanceledError" },
    { __CANCEL__: true },
    { code: "ABORTED" },
  ])("normalizes Axios and project cancellation %#", (cancellation) => {
    const normalized = normalizeApiError(cancellation);

    expect(normalized).toMatchObject({ kind: "aborted", isAborted: true, isNetworkError: false });
  });

  it.each([
    [400, "bad_request", {}],
    [401, "unauthorized", { isUnauthorized: true }],
    [403, "forbidden", { isForbidden: true }],
    [404, "not_found", { isNotFound: true }],
    [409, "conflict", { isConflict: true }],
    [429, "rate_limited", { isRateLimited: true }],
    [500, "server", { isServerError: true }],
  ])("normalizes HTTP %s", (status, kind, flags) => {
    const normalized = normalizeApiError(httpError(status, { detail: "Backend detail" }));

    expect(normalized).toMatchObject({ status, kind, message: "Backend detail", ...flags });
  });

  it("normalizes 422 validation field errors", () => {
    const normalized = normalizeApiError(httpError(422, {
      detail: [
        { loc: ["body", "email"], msg: "Invalid email", type: "value_error" },
        { loc: ["body", "profile", "phone"], msg: "Invalid phone", type: "value_error" },
      ],
    }));

    expect(normalized).toMatchObject({ kind: "validation", isValidationError: true });
    expect(normalized.fieldErrors).toEqual({ email: "Invalid email", "profile.phone": "Invalid phone" });
  });

  it("reads a structured backend error message safely", () => {
    const normalized = normalizeApiError(httpError(400, {
      error: { message: "Structured backend error", code: "INVALID_INPUT" },
    }));

    expect(normalized.message).toBe("Structured backend error");
    expect(normalized.details).toEqual({ message: "Structured backend error", code: "INVALID_INPUT" });
  });

  it("normalizes an unknown error without pretending it is a network response", () => {
    const normalized = normalizeApiError(new Error("Unexpected failure"));

    expect(normalized).toMatchObject({ kind: "unknown", status: null, isNetworkError: false });
  });

  it("does not expose tokens or authorization values", () => {
    const accessValue = "sensitive-access-value-for-test";
    const refreshValue = "sensitive-refresh-value-for-test";
    const passwordValue = "sensitive-password-value-for-test";
    const normalized = normalizeApiError({
      response: {
        status: 422,
        data: {
          message: `Authorization: Bearer ${accessValue}`,
          detail: [{ loc: ["body", "password"], msg: "Invalid password", input: passwordValue }],
          errors: {
            access_token: accessValue,
            refresh_token: refreshValue,
            profile: { reason: `Bearer ${refreshValue}` },
          },
        },
      },
      config: { headers: { Authorization: `Bearer ${accessValue}` } },
    });
    const serialized = JSON.stringify(normalized);

    expect(serialized).not.toContain(accessValue);
    expect(serialized).not.toContain(refreshValue);
    expect(serialized).not.toContain(passwordValue);
    expect(serialized).not.toContain("config");
  });

  it.each([
    "pin",
    "pin_code",
    "pinCode",
    "pincode",
    "passcode",
    "password",
    "current_password",
    "newPassword",
    "old-password",
    "confirm_password",
    "passwordConfirmation",
    "credential",
    "credentials",
    "secret",
    "clientSecret",
    "access_token",
    "refreshToken",
    "Authorization",
    "api-key",
    "otp",
    "oneTimePassword",
  ])("removes sensitive validation input for %s", (field) => {
    const marker = `validation-marker-${field}`;
    const error = httpError(422, {
      detail: [{ loc: ["body", field], msg: "Invalid credential", input: marker }],
      errors: { [field]: marker },
    });

    expectNormalizedErrorToExclude(error, marker);
  });

  it.each([
    ["path", (marker) => ({ detail: [{ path: ["body", "pin_code"], input: marker }] })],
    ["field", (marker) => ({ detail: [{ field: "profile.currentPassword", input: marker }] })],
    ["message", (marker) => ({ message: `pin=${marker}` })],
    ["detail", (marker) => ({ detail: `passcode:${marker}` })],
    ["error", (marker) => ({ error: `credentials=${marker}` })],
    ["errors", (marker) => ({ errors: { profile: { clientSecret: marker } } })],
    ["code", (marker) => ({ code: `access_token=${marker}` })],
    ["nested object", (marker) => ({ detail: { profile: { newPassword: marker } } })],
    ["nested array", (marker) => ({ detail: [{ metadata: { otp: marker } }] })],
    ["authorization", (marker) => ({ message: `Authorization: Bearer ${marker}` })],
  ])("removes sensitive markers from %s", (source, createData) => {
    const marker = `nested-marker-${source.replace(/\s/g, "-")}`;

    expectNormalizedErrorToExclude(httpError(422, createData(marker)), marker);
  });

  it.each([
    ["safe loc with sensitive path", (marker) => ([{
      loc: ["body", "description"], path: ["body", "currentPassword"], input: marker,
    }])],
    ["safe loc with sensitive field", (marker) => ([{
      loc: ["body", "description"], field: "pinCode", input: marker,
    }])],
    ["sensitive loc with safe path", (marker) => ([{
      loc: ["body", "CurrentPassword"], path: ["body", "description"], input: marker,
    }])],
    ["one sensitive source among all locations", (marker) => ([{
      loc: ["body", "description"], path: ["body", "profile.name"], field: "profile.pinCode", input: marker,
    }])],
    ["Input key", (marker) => ([{ loc: ["body", "pin"], Input: marker }])],
    ["INPUT key", (marker) => ([{ loc: ["body", "pin"], INPUT: marker }])],
    ["inPut key", (marker) => ([{ loc: ["body", "pin"], inPut: marker }])],
    ["PascalCase path", (marker) => ([{ path: "CurrentPassword", input: marker }])],
    ["dot notation password path", (marker) => ([{ field: "profile.currentPassword", input: marker }])],
    ["dot notation PIN path", (marker) => ([{ field: "profile.pinCode", input: marker }])],
    ["case-variant location keys", (marker) => ([{
      LOC: ["body", "description"], Path: ["body", "auth.accessToken"], FIELD: "profile.name", inPut: marker,
    }])],
    ["nested array", (marker) => ([{
      children: [{ loc: ["body", "description"], path: "credentials.passcode", input: marker }],
    }])],
    ["nested object", (marker) => ({
      validation: { loc: ["body", "description"], field: "user.oneTimePassword", INPUT: marker },
    })],
  ])("removes sensitive input from mixed validation locations: %s", (scenario, createDetail) => {
    const marker = `mixed-location-marker-${scenario.replace(/\s/g, "-")}`;

    expectNormalizedErrorToExclude(httpError(422, { detail: createDetail(marker) }), marker);
  });

  it("preserves a safe validation field and safe input", () => {
    const marker = "safe-validation-input-marker";
    const normalized = normalizeApiError(httpError(422, {
      detail: [{
        loc: ["body", "description"],
        path: "profile.displayName",
        field: "summary",
        input: marker,
        msg: "Invalid description",
      }],
    }));

    expect(JSON.stringify(normalized)).toContain(marker);
    expect(normalized.fieldErrors).toEqual({ description: "Invalid description" });
  });

  it("keeps expected technical error codes and drops arbitrary backend code text", () => {
    expect(normalizeApiError({ code: "ERR_NETWORK" }).code).toBe("ERR_NETWORK");
    expect(normalizeApiError(httpError(400, { code: "INVALID_INPUT" })).code).toBe("INVALID_INPUT");

    const marker = "arbitrary-code-marker";
    const normalized = normalizeApiError(httpError(400, { code: `unexpected backend text ${marker}` }));
    expect(normalized.code).toBeNull();
    expect(JSON.stringify(normalized)).not.toContain(marker);
  });
});

describe("normalizeTokenResponse", () => {
  it("normalizes a valid token pair", () => {
    expect(normalizeTokenResponse({
      access_token: "access-for-test",
      refresh_token: "refresh-for-test",
      token_type: "bearer",
    })).toEqual({
      access_token: "access-for-test",
      refresh_token: "refresh-for-test",
      token_type: "bearer",
    });
  });

  it("rejects a response without access_token", () => {
    expect(() => normalizeTokenResponse({ refresh_token: "refresh-for-test" })).toThrow(ApiContractError);
    try {
      normalizeTokenResponse({ refresh_token: "refresh-for-test" });
    } catch (error) {
      expect(error).toMatchObject({ code: "INVALID_TOKEN_RESPONSE", field: "access_token" });
    }
  });

  it("allows an access-only response unless refresh is required", () => {
    expect(normalizeTokenResponse({ access_token: "access-for-test" })).toEqual({
      access_token: "access-for-test",
      refresh_token: "",
      token_type: "bearer",
    });
    expect(() => normalizeTokenResponse(
      { access_token: "access-for-test" },
      { requireRefreshToken: true },
    )).toThrow(ApiContractError);
  });

  it("ignores unrelated response fields", () => {
    expect(normalizeTokenResponse({
      access_token: "access-for-test",
      refresh_token: "refresh-for-test",
      unrelated: { admin: true },
    })).toEqual({
      access_token: "access-for-test",
      refresh_token: "refresh-for-test",
      token_type: "bearer",
    });
  });
});

describe("normalizeProfileResponse", () => {
  it("keeps role_slugs as a string array", () => {
    const profile = normalizeProfileResponse({ id: "user-1", role_slugs: ["owner", "auditor"] });

    expect(profile.role_slugs).toEqual(["owner", "auditor"]);
  });

  it("normalizes a single string role without elevating it", () => {
    const profile = normalizeProfileResponse({ id: "user-1", role_slugs: "auditor" });

    expect(profile.role_slugs).toEqual(["auditor"]);
    expect(profile.is_superadmin).toBe(false);
  });

  it("normalizes absent role_slugs to an empty array", () => {
    expect(normalizeProfileResponse({ id: "user-1" }).role_slugs).toEqual([]);
  });

  it("does not synthesize superadmin", () => {
    expect(normalizeProfileResponse({ id: "user-1", role_slugs: ["admin"] }).is_superadmin).toBe(false);
    expect(normalizeProfileResponse({ id: "user-1", is_superadmin: true }).is_superadmin).toBe(true);
  });

  it("preserves unknown roles instead of promoting them", () => {
    const profile = normalizeProfileResponse({ id: "user-1", role_slugs: ["custom-role"] });

    expect(profile.role_slugs).toEqual(["custom-role"]);
    expect(profile.role_slugs).not.toContain("admin");
  });
});

describe("normalizePaginatedList", () => {
  it("normalizes a plain array", () => {
    const raw = [{ id: 1 }, { id: 2 }];

    expect(normalizePaginatedList(raw)).toEqual({
      items: raw,
      total: 2,
      page: 1,
      size: 2,
      pages: 1,
      raw,
    });
  });

  it("normalizes the backend page format", () => {
    const raw = { items: [{ id: 1 }], total: 7, page: 2, size: 3, pages: 3 };

    expect(normalizePaginatedList(raw)).toEqual({ ...raw, raw });
  });

  it("normalizes a results/count response", () => {
    const raw = { results: [{ id: 1 }], count: 4 };

    expect(normalizePaginatedList(raw)).toEqual({
      items: raw.results,
      total: 4,
      page: null,
      size: null,
      pages: null,
      raw,
    });
  });

  it("does not invent metadata for empty results with a positive count", () => {
    const raw = { results: [], count: 42 };

    expect(normalizePaginatedList(raw)).toEqual({
      items: [],
      total: 42,
      page: null,
      size: null,
      pages: null,
      raw,
    });
  });

  it("preserves a confirmed zero count without inventing metadata", () => {
    const raw = { results: [], count: 0 };

    expect(normalizePaginatedList(raw)).toEqual({
      items: [],
      total: 0,
      page: null,
      size: null,
      pages: null,
      raw,
    });
  });

  it("does not infer pages from a partial final results page", () => {
    const raw = { results: [{ id: 21 }, { id: 22 }, { id: 23 }], count: 23 };
    const normalized = normalizePaginatedList(raw);

    expect(normalized).toMatchObject({ total: 23, page: null, size: null, pages: null });
  });

  it("preserves validated metadata supplied with results/count", () => {
    const raw = { results: [{ id: 21 }], count: 21, page: 3, size: 10, pages: 3 };

    expect(normalizePaginatedList(raw)).toEqual({
      items: raw.results,
      total: 21,
      page: 3,
      size: 10,
      pages: 3,
      raw,
    });
  });

  it.each([
    ["numeric string", "42"],
    ["empty string", ""],
    ["true", true],
    ["false", false],
    ["null", null],
    ["undefined", undefined],
    ["negative", -1],
    ["fraction", 1.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["negative Infinity", Number.NEGATIVE_INFINITY],
  ])("rejects an invalid results/count value: %s", (description, count) => {
    expect(() => normalizePaginatedList({ results: [], count })).toThrow(ApiContractError);
  });

  it.each(["page", "size", "pages"])("rejects invalid %s metadata without coercion", (field) => {
    const invalidValues = ["2", true, false, 1.5, Number.NaN, Infinity, -1, 0, null, undefined];

    invalidValues.forEach((value) => {
      expect(() => normalizePaginatedList({
        results: [],
        count: 0,
        [field]: value,
      })).toThrow(ApiContractError);
    });
  });

  it("keeps a valid empty list empty", () => {
    expect(normalizePaginatedList([]).items).toEqual([]);
    const raw = { items: [], total: 0, page: 1, size: 20, pages: 0 };
    expect(normalizePaginatedList(raw)).toEqual({ ...raw, raw });
  });

  it("rejects an incompatible object instead of returning an empty list", () => {
    expect(() => normalizePaginatedList({ data: [] })).toThrow(ApiContractError);
    expect(() => normalizePaginatedList({ items: null })).toThrow(ApiContractError);
    expect(() => normalizePaginatedList({ results: [], count: "invalid" })).toThrow(ApiContractError);
  });

  it("does not convert an error into an empty list", () => {
    const error = new Error("request failed");

    expect(() => normalizePaginatedList(error)).toThrow(error);
  });
});
