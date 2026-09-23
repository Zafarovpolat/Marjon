import { readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import StaffRolePage from "../StaffRolePage";

vi.mock("../../api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  formatMoney: (value) => `${value}`,
  formatNumber: (value) => `${value}`,
}));

describe("staff empty state (Reports parity)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: [] });
  });

  it("renders the report-style illustration with the staff message on empty", async () => {
    render(<StaffRolePage role="waiter" />);
    const title = await screen.findByText("Сотрудники не найдены");
    expect(title).toBeInTheDocument();
    // Same shared Reports illustration, decorative image + semantic title.
    const table = document.querySelector(".staff-table");
    const emptyCell = title.closest("td");
    expect(emptyCell).not.toBeNull();
    expect(emptyCell.getAttribute("colSpan")).toBe("8");
    expect(within(table).getByRole("status")).toBeInTheDocument();
    const image = table.querySelector(".owner-report-empty-image");
    expect(image).not.toBeNull();
    expect(image.getAttribute("src")).toBeTruthy();
    // Card shell + column headers stay intact.
    expect(screen.getAllByRole("columnheader")).toHaveLength(8);
  });

  it("marks the empty row so hover and padding never leak into it", async () => {
    render(<StaffRolePage role="waiter" />);
    await screen.findByText("Сотрудники не найдены");
    const row = screen.getByText("Сотрудники не найдены").closest("tr");
    expect(row.classList.contains("staff-empty-row")).toBe(true);
  });

  it("locks empty-row hover and padding rules to the Reports pattern", () => {
    const css = readFileSync(
      `${process.cwd()}/src/styles/owner/staff-users.css`,
      "utf8",
    );
    const hover = css.match(
      /\.staff-table tbody tr\.staff-empty-row:hover \{[^}]*\}/,
    );
    expect(hover).not.toBeNull();
    expect(hover[0]).toContain("background: #fff");
    const cell = css.match(
      /\.staff-table tr\.staff-empty-row td\.staff-empty-cell \{[^}]*\}/,
    );
    expect(cell).not.toBeNull();
    expect(cell[0]).toContain("padding: 0");
    expect(cell[0]).toContain("background: #fff");
    // Populated-row hover stays intact.
    const base = css.match(
      /\.staff-table tbody tr:hover \{[^}]*\}/,
    );
    expect(base).not.toBeNull();
    expect(base[0]).toContain("var(--neutral-50)");
  });

  it("shows no empty illustration when rows exist", async () => {
    api.get.mockResolvedValue({
      data: [{
        id: "w1", name: "Waiter One", email: null, phone: "998901234567",
        role_slug: "waiter", role_slugs: ["waiter"], is_active: true,
      }],
    });
    render(<StaffRolePage role="waiter" />);
    await screen.findByText("Waiter One");
    expect(document.querySelector(".owner-report-empty-image")).toBeNull();
  });
});
