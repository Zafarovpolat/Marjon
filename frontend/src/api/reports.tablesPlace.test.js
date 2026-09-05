import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";
import { reportsService } from "./reports";

vi.mock("./client", () => ({ api: { get: vi.fn(() => Promise.resolve({ data: [] })) } }));

describe("reportsService.listTables — canonical hall_id serialization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends hall_id when a real hall is selected", () => {
    reportsService.listTables("2026-08-01", "2026-08-25", { filters: { hallId: "hall-zal" } });
    const [, config] = api.get.mock.calls[0];
    expect(api.get).toHaveBeenCalledWith("/reports/tables", expect.anything());
    expect(config.params).toMatchObject({ hall_id: "hall-zal" });
  });

  it('omits hall_id when hallId is "all"', () => {
    reportsService.listTables("2026-08-01", "2026-08-25", { filters: { hallId: "all" } });
    const [, config] = api.get.mock.calls[0];
    expect(config.params).not.toHaveProperty("hall_id");
  });

  it("omits hall_id when hallId is absent", () => {
    reportsService.listTables("2026-08-01", "2026-08-25", { filters: {} });
    const [, config] = api.get.mock.calls[0];
    expect(config.params).not.toHaveProperty("hall_id");
  });
});
