import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";
import { warehouseService } from "./warehouse";

// Пакетный состав документов: экраны склада раньше делали по запросу на
// каждый документ (до 60 параллельных getPurchase), теперь — один запрос
// на список. Эти тесты держат контракт транспорта: путь, формат ids и
// нарезку по 100 (URL не должен вырасти до предела).
describe("warehouseService batch document details", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends one request with comma-separated ids for purchases", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({
      data: [{ id: "d1", items: [] }, { id: "d2", items: [] }],
    });

    const result = await warehouseService.listPurchaseDetails(["d1", "d2"]);

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/warehouse/purchases/details", { params: { ids: "d1,d2" } });
    expect(result.data).toHaveLength(2);
  });

  it("sends one request with comma-separated ids for expenses", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: [{ id: "e1", items: [] }] });

    const result = await warehouseService.listExpenseDetails(["e1"]);

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/warehouse/expenses/details", { params: { ids: "e1" } });
    expect(result.data).toEqual([{ id: "e1", items: [] }]);
  });

  it("keeps the caller's config (abort signal) on every chunk", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: [] });
    const controller = new AbortController();

    await warehouseService.listPurchaseDetails(["d1"], { signal: controller.signal });

    expect(get.mock.calls[0][1].signal).toBe(controller.signal);
    expect(get.mock.calls[0][1].params).toEqual({ ids: "d1" });
  });

  it("does not hit the network for an empty id list", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: [] });

    const result = await warehouseService.listPurchaseDetails([]);

    expect(get).not.toHaveBeenCalled();
    expect(result.data).toEqual([]);
  });

  it("drops empty ids instead of sending holes to the backend", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: [] });

    await warehouseService.listExpenseDetails(["e1", null, "", undefined, "e2"]);

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/warehouse/expenses/details", { params: { ids: "e1,e2" } });
  });

  it("chunks long id lists by 100 and merges the responses in order", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `d${i + 1}`);
    const get = vi.spyOn(api, "get").mockImplementation(async (_path, config) => ({
      data: config.params.ids.split(",").map((id) => ({ id, items: [] })),
    }));

    const result = await warehouseService.listPurchaseDetails(ids);

    expect(get).toHaveBeenCalledTimes(3);
    expect(get.mock.calls[0][1].params.ids.split(",")).toHaveLength(100);
    expect(get.mock.calls[1][1].params.ids.split(",")).toHaveLength(100);
    expect(get.mock.calls[2][1].params.ids.split(",")).toHaveLength(50);
    expect(result.data.map((doc) => doc.id)).toEqual(ids);
  });

  it("accepts a wrapped { items } payload as well as a bare list", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { items: [{ id: "d1", items: [] }] } });

    const result = await warehouseService.listPurchaseDetails(["d1"]);

    expect(result.data).toEqual([{ id: "d1", items: [] }]);
  });
});
