import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api", () => ({
  adminApi: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { adminApi } from "../../api";
import { organizationsApi } from "./organizationsApi";

describe("organizationsApi canonical contracts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards organization paging, search, filters, and cancellation", () => {
    const signal = new AbortController().signal;
    const params = { page: 3, size: 50, search: "cafe", status: "active", organization_status_id: "status-1" };
    organizationsApi.listOrganizations(params, { signal, params: { size: 999 } });
    expect(adminApi.get).toHaveBeenCalledWith("/organizations", { signal, params });
  });

  it("uses canonical organization create, update, and soft-delete routes", () => {
    const payload = { name: "Cafe" };
    organizationsApi.createOrganization(payload);
    organizationsApi.updateOrganization("org-1", payload);
    organizationsApi.archiveOrganization("org-1");
    expect(adminApi.post).toHaveBeenCalledWith("/organizations", payload, {});
    expect(adminApi.patch).toHaveBeenCalledWith("/organizations/org-1", payload, {});
    expect(adminApi.delete).toHaveBeenCalledWith("/organizations/org-1", {});
  });

  it("forwards status pagination, search, filters, sort, and cancellation", () => {
    const signal = new AbortController().signal;
    const params = { page: 2, size: 20, search: "active", status: "true", sort: "sort" };
    organizationsApi.listOrganizationStatuses(params, { signal });
    expect(adminApi.get).toHaveBeenCalledWith("/organization-statuses", { signal, params });
  });

  it("loads canonical geography dictionaries used by organization forms", () => {
    const signal = new AbortController().signal;
    const params = { page: 1, size: 200 };
    organizationsApi.listCountries(params, { signal });
    organizationsApi.listRegions(params, { signal });
    organizationsApi.listDistricts(params, { signal });
    expect(adminApi.get).toHaveBeenNthCalledWith(1, "/countries", { signal, params });
    expect(adminApi.get).toHaveBeenNthCalledWith(2, "/regions", { signal, params });
    expect(adminApi.get).toHaveBeenNthCalledWith(3, "/districts", { signal, params });
  });

  it("uses canonical status create, update, and hard-delete routes", () => {
    const payload = { name: "Active", sort: 1, status: true };
    organizationsApi.createOrganizationStatus(payload);
    organizationsApi.updateOrganizationStatus("status-1", payload);
    organizationsApi.deleteOrganizationStatus("status-1");
    expect(adminApi.post).toHaveBeenCalledWith("/organization-statuses", payload, {});
    expect(adminApi.patch).toHaveBeenCalledWith("/organization-statuses/status-1", payload, {});
    expect(adminApi.delete).toHaveBeenCalledWith("/organization-statuses/status-1", {});
  });

  it.each([
    ["organization update", () => organizationsApi.updateOrganization("", {})],
    ["organization archive", () => organizationsApi.archiveOrganization(null)],
    ["status update", () => organizationsApi.updateOrganizationStatus("  ", {})],
    ["status delete", () => organizationsApi.deleteOrganizationStatus(undefined)],
  ])("rejects a missing resource id before transport: %s", (_label, request) => {
    expect(request).toThrow(/is required/);
    expect(adminApi.patch).not.toHaveBeenCalled();
    expect(adminApi.delete).not.toHaveBeenCalled();
  });
});
