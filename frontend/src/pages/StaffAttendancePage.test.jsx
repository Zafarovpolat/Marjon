import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { api } from "../api/client";
import StaffActivityPage from "./StaffActivityPage";

vi.mock("../api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  formatMoney: (value) => `${value}`,
  formatNumber: (value) => `${value}`,
}));

const backendRow = {
  date: "23.09.2026",
  employee: "Алишер Каримов",
  role: "Официант",
  start: "09:00",
  end: "18:00",
  hours: "9 ч 0 мин",
  status: "Закрыта",
};

const EXPECTED_HEADERS = [
  "Сотрудник",
  "Роль",
  "Дата",
  "Время прихода",
  "Время ухода",
  "Отработано",
  "Статус",
];

describe("attendance page contract (/users/attendance) — ATTENDANCE-01", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: [backendRow] });
  });

  it("renders exactly the 7 approved headers in order, no extras", async () => {
    render(<StaffActivityPage type="attendance" />);
    await screen.findByText("Алишер Каримов");

    const headers = screen.getAllByRole("columnheader").map((c) => c.textContent);
    expect(headers).toEqual(EXPECTED_HEADERS);

    const table = document.querySelector(".staff-table");
    expect(within(table).queryByText("Телефон")).toBeNull();
    expect(within(table).queryByText("Действия")).toBeNull();
    expect(within(table).queryByText("Права доступа")).toBeNull();
    expect(within(table).queryByText("ID")).toBeNull();
    expect(within(table).queryByText("Фото")).toBeNull();
  });

  it("maps backend fields truthfully, no invented values", async () => {
    render(<StaffActivityPage type="attendance" />);
    const row = (await screen.findByText("Алишер Каримов")).closest("tr");
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
    expect(cells).toEqual(["Алишер Каримов", "Официант", "23.09.2026", "09:00", "18:00", "9 ч 0 мин", "Закрыта"]);
  });

  it("keeps open shifts honest (no fake checkout or duration)", async () => {
    api.get.mockResolvedValue({
      data: [{ ...backendRow, employee: "Открытая смена", end: "", hours: "" }],
    });
    render(<StaffActivityPage type="attendance" />);
    const row = (await screen.findByText("Открытая смена")).closest("tr");
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
    expect(cells[4]).toBe("—");
    expect(cells[5]).toBe("—");
    expect(cells[3]).toBe("09:00");
  });

  it("renders backend status truthfully without inventing business states", async () => {
    render(<StaffActivityPage type="attendance" />);
    await screen.findByText("Алишер Каримов");
    const table = document.querySelector(".staff-table");
    expect(within(table).getByText("Закрыта")).toBeInTheDocument();
    for (const invented of ["Опоздал", "Отсутствовал", "Вовремя"]) {
      expect(within(table).queryByText(invented)).toBeNull();
    }
  });

  it("shows loading without premature empty state", async () => {
    let resolveGet;
    api.get.mockReturnValue(new Promise((resolve) => { resolveGet = resolve; }));
    render(<StaffActivityPage type="attendance" />);

    expect(await screen.findByText("Загрузка посещаемости...")).toBeInTheDocument();
    expect(screen.queryByText("Данных о посещаемости пока нет.")).not.toBeInTheDocument();

    resolveGet({ data: [] });
    expect(await screen.findByText("Данных о посещаемости пока нет.")).toBeInTheDocument();
  });

  it("renders the shared Reports empty state with colSpan 7", async () => {
    api.get.mockResolvedValue({ data: [] });
    render(<StaffActivityPage type="attendance" />);
    const title = await screen.findByText("Данных о посещаемости пока нет.");
    const emptyCell = title.closest("td");
    expect(emptyCell.getAttribute("colSpan")).toBe("7");
    expect(emptyCell.classList.contains("staff-empty-cell")).toBe(true);
    expect(emptyCell.closest("tr").classList.contains("staff-empty-row")).toBe(true);
    expect(document.querySelector(".staff-table").querySelector(".owner-report-empty-image")).not.toBeNull();
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
  });

  it("renders backend failure as error, never as empty", async () => {
    api.get.mockRejectedValue(new Error("offline"));
    render(<StaffActivityPage type="attendance" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить данные активности сотрудников.");
    expect(screen.queryByText("Данных о посещаемости пока нет.")).not.toBeInTheDocument();
  });

  it("exposes no Excel, add, edit, archive or action controls", async () => {
    render(<StaffActivityPage type="attendance" />);
    await screen.findByText("Алишер Каримов");
    const page = document.querySelector(".staff-page");
    expect(within(page).queryByText("Скачать Excel")).toBeNull();
    expect(page.querySelector('input[type="file"]')).toBeNull();
    expect(within(page).queryByRole("button", { name: /Добавить/ })).toBeNull();
    expect(within(page).queryByText("Архивировать")).toBeNull();
    expect(screen.getByText("Посещаемость")).toBeInTheDocument();
  });

  it("requests the canonical attendance endpoint", async () => {
    render(<StaffActivityPage type="attendance" />);
    await screen.findByText("Алишер Каримов");
    expect(api.get).toHaveBeenCalledWith(
      "/hr/attendance",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

describe("attendance visual alignment (Staff journal family)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: [backendRow] });
  });

  it("uses the Staff product shell and journal table modifier", async () => {
    render(<StaffActivityPage type="attendance" />);
    await screen.findByText("Алишер Каримов");
    expect(document.querySelector(".staff-page.staff-page--cashier")).not.toBeNull();
    expect(document.querySelector(".staff-card.staff-card--cashier")).not.toBeNull();
    expect(document.querySelector(".staff-header.staff-header--cashier")).not.toBeNull();
    expect(document.querySelector(".staff-table.staff-table--attendance")).not.toBeNull();
  });

  it("locks scoped centering + approved row height for the attendance table", () => {
    const css = readFileSync(
      `${process.cwd()}/src/styles/owner/staff-users.css`,
      "utf8",
    );
    const block = css.match(
      /\.staff-card--cashier \.staff-table--attendance th,[\s\S]*?\{[^}]*\}/,
    );
    expect(block).not.toBeNull();
    expect(block[0]).toContain("padding: 15px 16px");
    expect(block[0]).toContain("text-align: center");
    expect(block[0]).toContain("td:not(.staff-empty-cell)");
  });
});
