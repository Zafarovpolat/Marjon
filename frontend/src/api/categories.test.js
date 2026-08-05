import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./errors", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    normalizeApiError: vi.fn(actual.normalizeApiError),
  };
});

import { api } from "./client";
import { getCategories } from "./categories";
import { normalizeApiError } from "./errors";

const HTTP_CASES = [
  [400, "bad_request"],
  [401, "unauthorized"],
  [403, "forbidden"],
  [404, "not_found"],
  [422, "validation"],
  [500, "server"],
];

async function captureTransportError(rawError) {
  vi.spyOn(api, "get").mockRejectedValueOnce(rawError);
  let caughtError;

  try {
    await getCategories();
  } catch (error) {
    caughtError = error;
  }

  expect(caughtError).toBeDefined();
  expect(normalizeApiError).toHaveBeenCalledTimes(1);
  expect(normalizeApiError).toHaveBeenCalledWith(rawError);
  return caughtError;
}

describe("getCategories", () => {
  beforeEach(() => {
    vi.mocked(normalizeApiError).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves the GET endpoint, request config, and Axios success response", async () => {
    const response = {
      data: [{ id: "category-1", name: "Safe category" }],
      status: 200,
      headers: { "x-reference": "safe" },
    };
    const get = vi.spyOn(api, "get").mockResolvedValueOnce(response);

    const result = await getCategories();

    expect(result).toBe(response);
    expect(result.data).toBe(response.data);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/inventory/categories");
    expect(get.mock.calls[0]).toHaveLength(1);
    expect(normalizeApiError).not.toHaveBeenCalled();
  });

  it.each(HTTP_CASES)("normalizes HTTP %s without losing safe API details", async (status, kind) => {
    const rawError = {
      response: {
        status,
        data: {
          message: `Safe category error ${status}`,
          code: "CATEGORY_LOOKUP_FAILED",
          errors: { category: "Safe category detail" },
        },
      },
    };

    const error = await captureTransportError(rawError);

    expect(error).toMatchObject({
      kind,
      status,
      message: `Safe category error ${status}`,
      code: "CATEGORY_LOOKUP_FAILED",
      details: { category: "Safe category detail" },
      isNetworkError: false,
      isTimeout: false,
      isAborted: false,
    });
  });

  it("normalizes a network error independently from timeout and cancellation", async () => {
    const error = await captureTransportError({
      code: "ERR_NETWORK",
      message: "Network Error",
      request: {},
    });

    expect(error).toMatchObject({
      kind: "network",
      status: null,
      isNetworkError: true,
      isTimeout: false,
      isAborted: false,
    });
  });

  it("normalizes a timeout independently from network and cancellation", async () => {
    const error = await captureTransportError({
      code: "ECONNABORTED",
      message: "timeout exceeded",
    });

    expect(error).toMatchObject({
      kind: "timeout",
      status: null,
      isNetworkError: false,
      isTimeout: true,
      isAborted: false,
    });
  });

  it.each([
    { code: "ERR_CANCELED" },
    { name: "CanceledError" },
    { __CANCEL__: true },
    { code: "ABORTED" },
  ])("normalizes cancellation %# without treating it as a network error", async (rawError) => {
    const error = await captureTransportError(rawError);

    expect(error).toMatchObject({
      kind: "aborted",
      isAborted: true,
      isNetworkError: false,
      isTimeout: false,
    });
  });

  it("redacts credential markers and omits the raw Axios envelope", async () => {
    const markers = {
      password: "pilot-password-marker-7Q",
      pin: "pilot-pin-marker-8R",
      currentPassword: "pilot-current-password-marker-9S",
      passcode: "pilot-passcode-marker-1T",
      oneTimePassword: "pilot-otp-marker-2U",
      accessToken: "pilot-access-marker-3V",
      refreshToken: "pilot-refresh-marker-4W",
      authorization: "pilot-authorization-marker-5X",
      nestedInput: "pilot-nested-input-marker-6Y",
      mixedLocation: "pilot-mixed-location-marker-7Z",
    };
    const rawError = {
      response: {
        status: 422,
        headers: {
          Authorization: `Bearer ${markers.authorization}`,
          "Set-Cookie": markers.refreshToken,
        },
        data: {
          message: `Authorization: Bearer ${markers.authorization}`,
          code: "CATEGORY_VALIDATION_FAILED",
          detail: [
            { loc: ["body", "password"], input: markers.password },
            { loc: ["body", "PIN"], Input: markers.pin },
            { path: "profile.currentPassword", INPUT: markers.currentPassword },
            { field: "credentials.passcode", inPut: markers.passcode },
            { loc: ["body", "oneTimePassword"], input: markers.oneTimePassword },
            { loc: ["body", "safe"], path: "profile.name", field: "auth.accessToken", input: markers.accessToken },
            { loc: ["body", "refreshToken"], input: markers.refreshToken },
            { loc: ["body", "credentials"], input: { nested: [markers.nestedInput] } },
            { loc: ["body", "safe"], path: "profile.name", field: "profile.pinCode", Input: markers.mixedLocation },
          ],
        },
      },
      config: {
        headers: {
          Authorization: `Bearer ${markers.authorization}`,
          Cookie: markers.refreshToken,
        },
      },
      request: {
        headers: { Authorization: `Bearer ${markers.authorization}` },
      },
    };

    const error = await captureTransportError(rawError);
    const serialized = JSON.stringify(error);

    Object.values(markers).forEach((marker) => {
      expect(serialized).not.toContain(marker);
    });
    expect(error).not.toHaveProperty("original");
    expect(error).not.toHaveProperty("config");
    expect(error).not.toHaveProperty("request");
    expect(error).not.toHaveProperty("response");
  });

  it("preserves safe message, code, field, input, and HTTP status", async () => {
    const safeInput = "safe-category-input";
    const error = await captureTransportError({
      response: {
        status: 422,
        data: {
          message: "Safe category validation message",
          code: "CATEGORY_LOOKUP_FAILED",
          detail: [{
            loc: ["body", "displayName"],
            path: "profile.name",
            field: "summary",
            Input: safeInput,
            msg: "Safe category field message",
          }],
        },
      },
    });

    expect(error).toMatchObject({
      kind: "validation",
      status: 422,
      message: "Safe category validation message",
      code: "CATEGORY_LOOKUP_FAILED",
      fieldErrors: { displayName: "Safe category field message" },
    });
    expect(JSON.stringify(error)).toContain(safeInput);
  });

  it("does not re-normalize an error that already has the normalized API shape", async () => {
    const normalizedError = normalizeApiError({
      response: {
        status: 404,
        data: { message: "Safe existing message", code: "CATEGORY_NOT_FOUND" },
      },
    });
    vi.mocked(normalizeApiError).mockClear();
    vi.spyOn(api, "get").mockRejectedValueOnce(normalizedError);

    await expect(getCategories()).rejects.toBe(normalizedError);
    expect(normalizeApiError).not.toHaveBeenCalled();
  });

  it("rejects an API error instead of converting it into an empty successful result", async () => {
    const rawError = {
      response: {
        status: 500,
        data: { message: "Safe server failure", code: "CATEGORY_LOOKUP_FAILED" },
      },
    };
    vi.spyOn(api, "get").mockRejectedValueOnce(rawError);

    await expect(getCategories()).rejects.toMatchObject({ kind: "server", status: 500 });
    expect(normalizeApiError).toHaveBeenCalledTimes(1);
  });

  it("keeps CategoriesPage on the service call without a direct categories GET", () => {
    const consumerSource = readFileSync(resolve(process.cwd(), "src/pages/CategoriesPage.jsx"), "utf8");

    expect(consumerSource).toContain('import { getCategories } from "../api/categories";');
    expect(consumerSource).toMatch(/const\s*{\s*data\s*}\s*=\s*await\s+getCategories\(\)/);
    expect(consumerSource).not.toMatch(/api\.get\(\s*["']\/inventory\/categories["']/);
  });
});
