import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api", () => ({ adminApi: { get: vi.fn() } }));

import { adminApi } from "../../api";
import { dashboardApi } from "./dashboardApi";

describe("dashboardApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the canonical Organization page total with a bounded request", async () => {
    adminApi.get.mockResolvedValue({ data: { items: [], total: 17, page: 1, size: 1, pages: 17 } });
    await expect(dashboardApi.getOrganizationTotal()).resolves.toBe(17);
    expect(adminApi.get).toHaveBeenCalledWith("/organizations", { params: { page: 1, size: 1 } });
  });

  it.each([undefined, null, -1, 1.5, "3"])("rejects a non-authoritative total: %s", async (total) => {
    adminApi.get.mockResolvedValue({ data: { total } });
    await expect(dashboardApi.getOrganizationTotal()).rejects.toThrow("Invalid Organization page total");
  });

  it("deduplicates the pending request used by React StrictMode", async () => {
    let resolveRequest;
    adminApi.get.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    const first = dashboardApi.getOrganizationTotal();
    const second = dashboardApi.getOrganizationTotal();
    expect(first).toBe(second);
    expect(adminApi.get).toHaveBeenCalledTimes(1);
    resolveRequest({ data: { total: 0 } });
    await expect(first).resolves.toBe(0);
  });
});
