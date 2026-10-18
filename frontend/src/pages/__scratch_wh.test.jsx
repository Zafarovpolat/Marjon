import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import WarehousePage from "./WarehousePage";

vi.mock("../api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const todayApi = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const todayReg = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} / 12:00`;

describe("scratch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: [] });
  });

  it("drill down", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/warehouse/purchases") return Promise.resolve({ data: [{
        id: "9c6082b6-3ab1-4d36-9a4c-87cd8bb4e7d5",
        number: "PUR-42",
        supplier: "Backend Supplier",
        warehouse_name: "Backend Warehouse",
        warehouse_id: "wh-1",
        total_amount: 125000,
        status: "draft",
        date: todayApi,
        registered_at: todayReg,
        items_count: 3,
      }] });
      if (url === "/warehouse/list") return Promise.resolve({ data: [{ id: "wh-1", name: "Backend Warehouse" }] });
      if (url.startsWith("/warehouse/purchases/")) return Promise.resolve({ data: {
        id: "9c6082b6-3ab1-4d36-9a4c-87cd8bb4e7d5", number: "PUR-42",
        items: [{ ingredient_id: "ing-1", quantity: 5, price: 25000 }],
      } });
      return Promise.resolve({ data: [] });
    });

    render(<WarehousePage initialSection="incoming" />);
    await new Promise((r) => setTimeout(r, 600));
    const link = screen.queryByRole("button", { name: /Открыть приходы склада/ });
    console.log("LINK:", link ? link.getAttribute("aria-label") : "none");
    if (link) {
      fireEvent.click(link);
      await new Promise((r) => setTimeout(r, 600));
    }
    const btns = [...document.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") || b.textContent.trim()).filter(Boolean);
    console.log("BTNS2:", JSON.stringify(btns.slice(0, 30)));
    console.log("TEXT2:", (document.body.textContent || "").replace(/\s+/g, " ").slice(0, 600));
    expect(true).toBe(true);
  });
});
