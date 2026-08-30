import { beforeEach, describe, expect, it, vi } from "vitest";

import { adminApi } from "./api";
import { hqService } from "./hqService";

vi.mock("./api", () => ({
  adminApi: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("HQ-01 hqService organization contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards canonical organization paging, search, filters, and cancellation", () => {
    const signal = new AbortController().signal;
    const params = { page: 3, size: 50, search: "cafe", status: "active", organization_status_id: "status-1" };
    hqService.listOrganizations(params, { signal });
    expect(adminApi.get).toHaveBeenCalledWith("/organizations", { params, signal });
  });

  it("uses canonical organization create, update, and soft-delete routes", () => {
    const payload = { name: "Cafe" };
    hqService.createOrganization(payload);
    hqService.updateOrganization("org-1", payload);
    hqService.archiveOrganization("org-1");
    expect(adminApi.post).toHaveBeenCalledWith("/organizations", payload, {});
    expect(adminApi.patch).toHaveBeenCalledWith("/organizations/org-1", payload, {});
    expect(adminApi.delete).toHaveBeenCalledWith("/organizations/org-1", {});
  });

  it("forwards canonical status pagination, search, filters, sort, and cancellation", () => {
    const signal = new AbortController().signal;
    const params = { page: 2, size: 20, search: "active", status: "true", sort: "sort" };
    hqService.listOrganizationStatuses(params, { signal });
    expect(adminApi.get).toHaveBeenCalledWith("/organization-statuses", { params, signal });
  });

  it("uses canonical status create, update, and hard-delete routes", () => {
    const payload = { name: "Active", sort: 1, status: true };
    hqService.createOrganizationStatus(payload);
    hqService.updateOrganizationStatus("status-1", payload);
    hqService.deleteOrganizationStatus("status-1");
    expect(adminApi.post).toHaveBeenCalledWith("/organization-statuses", payload, {});
    expect(adminApi.patch).toHaveBeenCalledWith("/organization-statuses/status-1", payload, {});
    expect(adminApi.delete).toHaveBeenCalledWith("/organization-statuses/status-1", {});
  });
});
