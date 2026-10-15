import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import NomenclaturePage from "../NomenclaturePage";
import { useDishesCatalog } from "./useDishesCatalog";
import { parseNomenclatureSort } from "./nomenclatureData";

vi.mock("../../api/client", () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock("../../components/Icon", () => ({ default: () => <span aria-hidden="true" /> }));

const product = (id, sort, active = true) => ({
  id, name: id, sort_order: sort, price: 100, cost_price: 0, unit: "шт",
  is_active: active, is_available: true, is_auto: false, is_set: false,
  ingredients_count: 0, category_id: null, printer_id: null,
});

function setup(initial = [product("A", 1), product("B", 2), product("C", 3)]) {
  let canonical = initial;
  let listFailure = false;
  api.get.mockImplementation((url) => {
    if (url === "/inventory/products") return listFailure
      ? Promise.reject(new Error("refetch failed")) : Promise.resolve({ data: canonical });
    return Promise.resolve({ data: [] });
  });
  return { setCanonical: (rows) => { canonical = rows; }, failRefetch: () => { listFailure = true; } };
}

async function loadedHook() {
  const hook = renderHook(() => useDishesCatalog());
  await waitFor(() => expect(hook.result.current.apiLoading).toBe(false));
  return hook;
}

describe("Dishes canonical positional sort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  it("keeps default 1 and accepts positive integer requests including 999", async () => {
    setup();
    const { result } = await loadedHook();
    act(() => result.current.openDrawer());
    expect(result.current.form.sort).toBe("1");
    expect(parseNomenclatureSort("1")).toBe(1);
    expect(parseNomenclatureSort("999")).toBe(999);
  });

  it.each(["0", "-1", "1.5"])("blocks invalid sort %s before API mutation", async (sort) => {
    setup();
    const { result } = await loadedHook();
    act(() => result.current.openDrawer(result.current.filteredRows[0]));
    act(() => result.current.setForm((form) => ({ ...form, sort })));
    await act(() => result.current.saveDish());
    expect(api.patch).not.toHaveBeenCalled();
    expect(result.current.actionError).not.toBe("");
  });

  it("sends requested sort and waits for full canonical refetch, without fake shifts", async () => {
    setup();
    const { result } = await loadedHook();
    act(() => result.current.openDrawer(result.current.filteredRows[2]));
    act(() => result.current.setForm((form) => ({ ...form, sort: "2" })));
    api.patch.mockResolvedValue({ data: product("C", 2) });
    let resolveList;
    api.get.mockImplementation((url) => url === "/inventory/products"
      ? new Promise((resolve) => { resolveList = resolve; }) : Promise.resolve({ data: [] }));
    let saving;
    act(() => { saving = result.current.saveDish(); });
    await waitFor(() => expect(resolveList).toBeTypeOf("function"));
    expect(api.patch).toHaveBeenCalledWith("/inventory/products/C", expect.objectContaining({ sort_order: 2 }));
    expect(result.current.filteredRows.map((row) => [row.id, row.sort])).toEqual([["A", "1"], ["B", "2"], ["C", "3"]]);
    await act(async () => {
      resolveList({ data: [product("A", 1), product("C", 2), product("B", 3)] });
      await saving;
    });
    expect(result.current.filteredRows.map((row) => [row.id, row.sort])).toEqual([["A", "1"], ["C", "2"], ["B", "3"]]);
    expect(result.current.drawerOpen).toBe(false);
    expect(api.get).toHaveBeenCalledWith("/inventory/products", { params: { include_all: true } });
  });

  it("create at oversized position refetches clamped server value", async () => {
    const state = setup();
    const { result } = await loadedHook();
    act(() => result.current.openDrawer());
    act(() => result.current.setForm((form) => ({ ...form, name: "D", sort: "999" })));
    api.post.mockResolvedValue({ data: product("D", 4) });
    state.setCanonical([product("A", 1), product("B", 2), product("C", 3), product("D", 4)]);
    await act(() => result.current.saveDish());
    expect(api.post).toHaveBeenCalledWith("/inventory/products", expect.objectContaining({ sort_order: 999 }));
    expect(result.current.filteredRows.at(-1).sort).toBe("4");
  });

  it("refetch failure stays honest and retries created ID via PATCH, not duplicate POST", async () => {
    const state = setup();
    const { result } = await loadedHook();
    act(() => result.current.openDrawer());
    act(() => result.current.setForm((form) => ({ ...form, name: "D" })));
    api.post.mockResolvedValue({ data: product("D", 1) });
    api.patch.mockResolvedValue({ data: product("D", 1) });
    state.failRefetch();
    await act(() => result.current.saveDish());
    expect(result.current.drawerOpen).toBe(true);
    expect(result.current.actionError).toContain("каталог не обновлён");
    expect(result.current.filteredRows.map((row) => row.id)).toEqual(["A", "B", "C"]);
    await act(() => result.current.saveDish());
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.patch).toHaveBeenCalledWith("/inventory/products/D", expect.any(Object));
  });

  it("archive and restore refetch both scopes including shifted neighbours", async () => {
    const state = setup([product("A", 1), product("B", 2), product("X", 1, false)]);
    const { result } = await loadedHook();
    api.delete.mockResolvedValue({});
    state.setCanonical([product("A", 1), product("X", 1, false), product("B", 2, false)]);
    await act(() => result.current.archiveDish("B"));
    expect(result.current.filteredRows.map((row) => row.id)).toEqual(["A"]);
    act(() => result.current.setShowArchived(true));
    api.patch.mockResolvedValue({ data: product("X", 2) });
    state.setCanonical([product("A", 1), product("B", 1, false), product("X", 2)]);
    await act(() => result.current.restoreDish("X"));
    expect(result.current.filteredRows.map((row) => [row.id, row.sort])).toEqual([["B", "1"]]);
    act(() => result.current.setShowArchived(false));
    expect(result.current.filteredRows.map((row) => [row.id, row.sort])).toEqual([["A", "1"], ["X", "2"]]);
  });

  it("renders canonical positions and response order in the real table", async () => {
    setup([product("A", 1), product("C", 2), product("B", 3)]);
    render(<NomenclaturePage />);
    const table = await screen.findByRole("table", { name: "Блюда" });
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(4));
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual(["1", "2", "3"]);
    expect(rows.map((row) => within(row).getAllByRole("cell")[2].textContent)).toEqual(["A", "C", "B"]);
  });
});
