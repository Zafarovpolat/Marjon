import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { settingsService } from "../api/settings";
import WaiterPage from "./WaiterPage";

vi.mock("../api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  formatMoney: (value) => `${value}`,
  logout: vi.fn(),
}));

vi.mock("../api/settings", () => ({
  settingsService: { listResource: vi.fn() },
}));

vi.mock("../api/receipt", () => ({
  printKitchenReceipt: vi.fn(),
  printOrderReceipt: vi.fn(),
}));

// Two halls each with a Table #5, plus Балкон #7 — the canonical same-number
// scenario. Identity is Table.id, never the number.
const HALLS = [
  { id: "hZal", name: "Зал", is_active: true, tables: [{ id: "tA", number: 5, hall_id: "hZal", is_active: true }] },
  { id: "hBar", name: "Бар", is_active: true, tables: [{ id: "tB", number: 5, hall_id: "hBar", is_active: true }] },
  { id: "hBal", name: "Балкон", is_active: true, tables: [{ id: "tC", number: 7, hall_id: "hBal", is_active: true }] },
];
const PRODUCTS = [{ id: "p1", name: "Plov", price: 10000, category_id: "c1", is_active: true, is_available: true }];
const CATEGORIES = [{ id: "c1", name: "Osh", is_active: true }];

let ordersData;
let hallsData;

function configureApi() {
  api.get.mockImplementation((url) => {
    if (url === "/companies/me/branches") return Promise.resolve({ data: [{ id: "branch-1", name: "Main" }] });
    if (url === "/pos/orders") return Promise.resolve({ data: ordersData });
    if (url === "/inventory/products") return Promise.resolve({ data: PRODUCTS });
    if (url === "/inventory/categories") return Promise.resolve({ data: CATEGORIES });
    return Promise.resolve({ data: [] });
  });
  settingsService.listResource.mockImplementation(() => Promise.resolve({ data: hallsData }));
}

function renderWaiter(entry) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/waiter" element={<WaiterPage mode="tables" />} />
        <Route path="/waiter/new" element={<WaiterPage mode="new" />} />
        <Route path="/waiter/order/:orderId" element={<WaiterPage mode="order" />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  ordersData = [];
  hallsData = HALLS;
  configureApi();
});

// placeholder-phase3-tests


async function waitForHrefs(predicate) {
  await waitFor(() => {
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(predicate(links)).toBe(true);
  });
}

const freeTableIds = () =>
  screen.getAllByRole("link")
    .map((a) => a.getAttribute("href"))
    .filter((href) => href?.includes("/waiter/new?table_id="))
    .map((href) => href.split("table_id=")[1]);

describe("WaiterPage — canonical table board", () => {
  it("renders real halls/tables and never the hardcoded 1..50 grid", async () => {
    renderWaiter("/waiter");
    await waitForHrefs((links) => links.includes("/waiter/new?table_id=tA"));
    expect(screen.getAllByText("Зал").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Бар").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Балкон").length).toBeGreaterThan(0);
    expect(freeTableIds().sort()).toEqual(["tA", "tB", "tC"]);
    expect(screen.queryByText("50")).not.toBeInTheDocument();
  });

  it("keeps same-number tables in different halls distinct", async () => {
    renderWaiter("/waiter");
    await waitForHrefs((links) => links.includes("/waiter/new?table_id=tA"));
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/waiter/new?table_id=tA");
    expect(links).toContain("/waiter/new?table_id=tB");
    // Both are #5 but resolve to different Table ids.
    expect(screen.getAllByText("5")).toHaveLength(2);
  });

  it("navigates a free tile with ?table_id=<uuid>, not ?table=<number>", async () => {
    renderWaiter("/waiter");
    await waitForHrefs((links) => links.includes("/waiter/new?table_id=tA"));
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links.some((href) => /\/waiter\/new\?table=\d+$/.test(href || ""))).toBe(false);
  });

  it("marks only the canonical Table occupied — same number in another hall stays free", async () => {
    ordersData = [{ id: "o1", order_number: "1", status: "new", table_id: "tA", table_number: "5", created_at: "2026-08-26T10:00:00Z" }];
    renderWaiter("/waiter");
    await waitForHrefs((links) => links.includes("/waiter/order/o1"));
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/waiter/new?table_id=tB"); // #5 in Бар still free
    expect(links).not.toContain("/waiter/new?table_id=tA");
  });

  it("legacy NULL-table_id order does NOT light up ambiguous same-number tiles, but resolves a unique number", async () => {
    ordersData = [
      { id: "oLegacyDup", order_number: "9", status: "new", table_id: null, table_number: "5", created_at: "2026-08-26T10:00:00Z" },
      { id: "oLegacyUniq", order_number: "8", status: "new", table_id: null, table_number: "7", created_at: "2026-08-26T10:00:00Z" },
    ];
    renderWaiter("/waiter");
    await waitForHrefs((links) => links.includes("/waiter/order/oLegacyUniq"));
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    // Ambiguous #5: both Зал and Бар #5 remain free (no false double occupancy).
    expect(links).toContain("/waiter/new?table_id=tA");
    expect(links).toContain("/waiter/new?table_id=tB");
    // Unique #7 legacy order resolves to its single table.
    expect(links).not.toContain("/waiter/new?table_id=tC");
  });

  it("shows an empty state and no fake tables when no halls are configured", async () => {
    hallsData = [];
    renderWaiter("/waiter");
    await screen.findByText(/Faol stollar/, { selector: ".pos-empty-inline" });
    expect(freeTableIds()).toHaveLength(0);
  });

  it("shows an error + retry (no 1..50 fallback) when hall loading fails", async () => {
    settingsService.listResource.mockRejectedValueOnce(new Error("boom"));
    renderWaiter("/waiter");
    const retry = await screen.findByRole("button", { name: "Qayta urinish" });
    expect(freeTableIds()).toHaveLength(0);

    fireEvent.click(retry);
    await waitForHrefs((links) => links.includes("/waiter/new?table_id=tA"));
    expect(settingsService.listResource).toHaveBeenCalledTimes(2);
  });
});

describe("WaiterPage — new order create", () => {
  it("sends table_id and NOT table_number for a dine-in order", async () => {
    api.post.mockResolvedValue({ data: { id: "new1", order_number: "99" } });
    api.patch.mockResolvedValue({ data: {} });
    renderWaiter("/waiter/new?table_id=tA");

    // Add a menu item, then submit once the real table selection has loaded.
    fireEvent.click(await screen.findByRole("button", { name: "Qo'shish" }));
    const submit = screen.getByRole("button", { name: "Oshxonaga" });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/pos/orders", expect.objectContaining({
      branch_id: "branch-1",
      order_type: "dine_in",
      table_id: "tA",
    })));
    const body = api.post.mock.calls[0][1];
    expect(body).not.toHaveProperty("table_number");
  });
});

describe("WaiterPage — order detail additional order link", () => {
  it("carries table_id for a canonical order", async () => {
    ordersData = [{ id: "o1", order_number: "1", status: "new", table_id: "tA", table_number: "5", items: [], created_at: "2026-08-26T10:00:00Z" }];
    renderWaiter("/waiter/order/o1");
    const link = await screen.findByRole("link", { name: /Qo'shimcha buyurtma/ });
    expect(link.getAttribute("href")).toBe("/waiter/new?table_id=tA");
  });

  it("falls back to manual selection for a legacy order (no fabricated identity)", async () => {
    ordersData = [{ id: "o2", order_number: "2", status: "new", table_id: null, table_number: "5", items: [], created_at: "2026-08-26T10:00:00Z" }];
    renderWaiter("/waiter/order/o2");
    const link = await screen.findByRole("link", { name: /Qo'shimcha buyurtma/ });
    expect(link.getAttribute("href")).toBe("/waiter/new");
  });
});

describe("WaiterPage — explicit table selection safety", () => {
  it("does NOT auto-select a table when ?table_id is absent; submit stays blocked", async () => {
    renderWaiter("/waiter/new");
    const picker = await screen.findByLabelText("Stol");
    expect(picker).toHaveValue("");
    // Even with a full cart, no table selected → submit disabled, no POST.
    fireEvent.click(await screen.findByRole("button", { name: "Qo'shish" }));
    expect(screen.getByRole("button", { name: "Oshxonaga" })).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("does NOT select a stale/foreign ?table_id; submit stays blocked", async () => {
    renderWaiter("/waiter/new?table_id=ghost-id");
    const picker = await screen.findByLabelText("Stol");
    expect(picker).toHaveValue("");
    fireEvent.click(await screen.findByRole("button", { name: "Qo'shish" }));
    expect(screen.getByRole("button", { name: "Oshxonaga" })).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("preselects a valid ?table_id (free-tile / additional-order navigation)", async () => {
    renderWaiter("/waiter/new?table_id=tB");
    const picker = await screen.findByLabelText("Stol");
    await waitFor(() => expect(picker).toHaveValue("tB"));
  });

  it("excludes inactive halls and inactive tables, keeps active ones", async () => {
    hallsData = [
      { id: "hA", name: "Активный", is_active: true, tables: [
        { id: "tActive", number: 1, hall_id: "hA", is_active: true },
        { id: "tInactive", number: 2, hall_id: "hA", is_active: false },
      ] },
      { id: "hDead", name: "Архив", is_active: false, tables: [
        { id: "tDeadHall", number: 3, hall_id: "hDead", is_active: true },
      ] },
    ];
    renderWaiter("/waiter");
    await waitForHrefs((links) => links.includes("/waiter/new?table_id=tActive"));
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).not.toContain("/waiter/new?table_id=tInactive");
    expect(links).not.toContain("/waiter/new?table_id=tDeadHall");
    expect(screen.queryByText("Архив")).not.toBeInTheDocument();
  });
});
