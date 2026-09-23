import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  role: "Сотрудник",
  device: "device-42",
  login: "09:15",
  logout: "18:40",
  status: "Успешно",
};

const EXPECTED_HEADERS = [
  "Сотрудник",
  "Роль",
  "Телефон",
  "Дата и время входа",
  "Устройство",
  "IP устройство",
];

describe("login history page contract (/users/login-history) — LOGIN-HISTORY-01", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: [backendRow] });
  });

  it("renders exactly the 7 approved headers in order, no legacy columns", async () => {
    render(<StaffActivityPage type="login-history" />);
    await screen.findByText("Алишер Каримов");

    const headers = screen.getAllByRole("columnheader").map((c) => c.textContent);
    expect(headers).toEqual(EXPECTED_HEADERS);

    const table = document.querySelector(".staff-table");
    expect(within(table).queryByText("Дата")).toBeNull();
    expect(within(table).queryByText("Время входа")).toBeNull();
    expect(within(table).queryByText("Время выхода")).toBeNull();
    expect(within(table).queryByText("Статус")).toBeNull();
    expect(within(table).queryByText("Действия")).toBeNull();
    expect(within(table).queryByText("ID")).toBeNull();
    expect(within(table).queryByText("Права доступа")).toBeNull();
  });

  it("maps backend fields truthfully with honest phone/IP placeholders", async () => {
    render(<StaffActivityPage type="login-history" />);
    const row = (await screen.findByText("Алишер Каримов")).closest("tr");
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
    // Сотрудник, Роль, Телефон, Дата и время входа, Устройство, IP.
    expect(cells).toEqual(["Алишер Каримов", "Сотрудник", "—", "23.09.2026 09:15", "device-42", "—"]);
  });

  it("composes datetime from truthful parts only, never manufactures", async () => {
    api.get.mockResolvedValue({
      data: [
        { ...backendRow, employee: "Только дата", login: "" },
        { ...backendRow, employee: "Только время", date: "" },
        { ...backendRow, employee: "Пусто", date: "", login: "" },
      ],
    });
    render(<StaffActivityPage type="login-history" />);
    const dateOnly = (await screen.findByText("Только дата")).closest("tr");
    expect(within(dateOnly).getAllByRole("cell").map((c) => c.textContent)[3]).toBe("23.09.2026");
    const timeOnly = (await screen.findByText("Только время")).closest("tr");
    expect(within(timeOnly).getAllByRole("cell").map((c) => c.textContent)[3]).toBe("09:15");
    const empty = (await screen.findByText("Пусто")).closest("tr");
    expect(within(empty).getAllByRole("cell").map((c) => c.textContent)[3]).toBe("—");
  });

  it("never renders logout anywhere", async () => {
    render(<StaffActivityPage type="login-history" />);
    await screen.findByText("Алишер Каримов");
    expect(screen.queryByText("18:40")).toBeNull();
    expect(document.querySelector(".staff-table").textContent).not.toContain("Время выхода");
  });

  it("shows loading without premature empty state", async () => {
    let resolveGet;
    api.get.mockReturnValue(new Promise((resolve) => { resolveGet = resolve; }));
    render(<StaffActivityPage type="login-history" />);

    expect(await screen.findByText("Загрузка истории входов...")).toBeInTheDocument();
    expect(screen.queryByText("Истории входов пока нет.")).not.toBeInTheDocument();

    resolveGet({ data: [] });
    expect(await screen.findByText("Истории входов пока нет.")).toBeInTheDocument();
  });

  it("renders the shared Reports empty state with colSpan 6", async () => {
    api.get.mockResolvedValue({ data: [] });
    render(<StaffActivityPage type="login-history" />);
    const title = await screen.findByText("Истории входов пока нет.");
    const emptyCell = title.closest("td");
    expect(emptyCell.getAttribute("colSpan")).toBe("6");
    expect(emptyCell.classList.contains("staff-empty-cell")).toBe(true);
    expect(emptyCell.closest("tr").classList.contains("staff-empty-row")).toBe(true);
    const table = document.querySelector(".staff-table");
    expect(table.querySelector(".owner-report-empty-image")).not.toBeNull();
    expect(screen.getAllByRole("columnheader")).toHaveLength(6);
  });

  it("renders backend failure as error, never as empty", async () => {
    api.get.mockRejectedValue(new Error("offline"));
    render(<StaffActivityPage type="login-history" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить данные активности сотрудников.");
    expect(screen.queryByText("Истории входов пока нет.")).not.toBeInTheDocument();
  });

  it("exposes no Excel, add, edit or action controls", async () => {
    render(<StaffActivityPage type="login-history" />);
    await screen.findByText("Алишер Каримов");
    const page = document.querySelector(".staff-page");
    expect(within(page).queryByText("Скачать Excel")).toBeNull();
    expect(page.querySelector('input[type="file"]')).toBeNull();
    expect(within(page).queryByText("Добавить")).toBeNull();
    expect(within(page).queryByRole("button", { name: /Добавить/ })).toBeNull();
    expect(screen.getByText("История входа")).toBeInTheDocument();
  });

  it("requests the canonical activity endpoint", async () => {
    render(<StaffActivityPage type="login-history" />);
    await screen.findByText("Алишер Каримов");
    expect(api.get).toHaveBeenCalledWith(
      "/hr/login-history",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

describe("login history visual alignment (Staff subcategory template)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: [backendRow] });
  });

  it("uses the Staff subcategory product shell classes", async () => {
    render(<StaffActivityPage type="login-history" />);
    await screen.findByText("Алишер Каримов");
    expect(document.querySelector(".staff-page.staff-page--cashier")).not.toBeNull();
    expect(document.querySelector(".staff-card.staff-card--cashier")).not.toBeNull();
    expect(document.querySelector(".staff-header.staff-header--cashier")).not.toBeNull();
    expect(document.querySelector(".staff-table.staff-table--login-history")).not.toBeNull();
  });

  it("shares the product shell with attendance (same journal family)", async () => {
    api.get.mockResolvedValue({ data: [] });
    render(<StaffActivityPage type="attendance" />);
    await screen.findByText("Посещаемость");
    expect(document.querySelector(".staff-page.staff-page--cashier")).not.toBeNull();
    expect(document.querySelector(".staff-card.staff-card--cashier")).not.toBeNull();
    expect(document.querySelector(".staff-header.staff-header--cashier")).not.toBeNull();
    expect(document.querySelector(".staff-table--login-history")).toBeNull();
    expect(document.querySelector(".staff-table--attendance")).not.toBeNull();
  });

  it("locks approved data-row height: product density kept, login restore scoped", () => {
    const css = readFileSync(
      `${process.cwd()}/src/styles/owner/staff-users.css`,
      "utf8",
    );
    // Role tables keep the approved 12px/14px product density.
    expect(css).toMatch(/\.staff-card--cashier \.staff-table td \{[^}]*padding: 12px 14px[^}]*\}/);
    // Login journal restores its approved 15px/16px row height…
    const restore = css.match(
      /\.staff-card--cashier \.staff-table--login-history th,[\s\S]*?\{[^}]*\}/,
    );
    expect(restore).not.toBeNull();
    expect(restore[0]).toContain("padding: 15px 16px");
    // …without touching the zero-padding empty cell or other tables.
    // (The CI no-flag gate enforces the banner separately.)
    expect(restore[0]).toContain("td:not(.staff-empty-cell)");
  });

  it("locks login-scoped centering for all headers and body values", () => {
    const css = readFileSync(
      `${process.cwd()}/src/styles/owner/staff-users.css`,
      "utf8",
    );
    const restore = css.match(
      /\.staff-card--cashier \.staff-table--login-history th,[\s\S]*?\{[^}]*\}/,
    );
    expect(restore).not.toBeNull();
    // One scoped rule centers the whole login journal (th + td).
    expect(restore[0]).toContain("text-align: center");
    // No broad/global centering leaked anywhere for other Staff tables.
    const globalCenter = css.match(/^\.staff-table (th|td) \{[^}]*text-align: center[^}]*\}/m);
    expect(globalCenter).toBeNull();
  });
});

describe("attendance route regression (shared component, journal contract)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: [] });
  });

  it("uses the Staff product shell with the 7-column attendance contract, no Excel", async () => {
    render(<StaffActivityPage type="attendance" />);
    await screen.findByText("Посещаемость");
    expect(document.querySelector(".staff-page.staff-page--cashier")).not.toBeNull();
    expect(document.querySelector(".staff-card.staff-card--cashier")).not.toBeNull();
    expect(document.querySelector(".staff-table.staff-table--attendance")).not.toBeNull();
    const headers = screen.getAllByRole("columnheader").map((c) => c.textContent);
    expect(headers).toEqual([
      "Сотрудник",
      "Роль",
      "Дата",
      "Время прихода",
      "Время ухода",
      "Отработано",
      "Статус",
    ]);
    expect(screen.queryByText("Скачать Excel")).toBeNull();
    expect(document.querySelector(".staff-page").querySelector('input[type="file"]')).toBeNull();
    expect(api.get).toHaveBeenCalledWith(
      "/hr/attendance",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
