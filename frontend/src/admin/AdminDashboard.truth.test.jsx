import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardPage } from "./AdminDashboard";
import { adminFinanceApi } from "./financeApi";
import { dashboardApi } from "./features/dashboard/dashboardApi";

const legacyDashboardLabels = [
  "Оборот за месяц",
  "Всего организаций",
  "Выполненная работа",
  "Оплаченная сумма",
  "Не оплачено",
  "Динамика оборота платформы",
];

describe("HQ-DASH-04 truthful legacy composition", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders the deliberate shell and only authoritative HQ transaction fields", async () => {
    vi.spyOn(dashboardApi, "getOrganizationTotal").mockResolvedValue(0);
    vi.spyOn(adminFinanceApi, "listTransactions").mockResolvedValue({
      data: {
        items: [{
          id: "transaction-uuid",
          id_num: 17,
          date: "2026-09-01T09:30:00Z",
          organization_id: "organization-uuid",
          organization_name: "Server Organization",
          counterparty_name: "Server Counterparty",
          payment_type_name: "CLICK",
          amount: 125000,
          direction: "income",
          category_name: "Subscription",
          comment: "Server comment",
          status: "PAID",
        }],
      },
    });

    const { container } = render(<DashboardPage onNotify={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Дашборд" })).toBeInTheDocument();
    expect(screen.getByText("Только подтверждённые данные")).toBeInTheDocument();
    expect(screen.getByText("Последние транзакции")).toBeInTheDocument();

    legacyDashboardLabels.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    expect(await screen.findByText("Канонический total")).toBeInTheDocument();
    expect(screen.getAllByText("Контракт не подключён").length).toBeGreaterThan(4);

    expect(await screen.findByText("Server Organization")).toBeInTheDocument();
    expect(screen.getByText("Server Counterparty")).toBeInTheDocument();
    expect(screen.getByText("125 000")).toBeInTheDocument();
    expect(screen.getByText("Приход")).toBeInTheDocument();
    expect(screen.getByText("Subscription")).toBeInTheDocument();

    expect(screen.queryByText("PAID")).not.toBeInTheDocument();
    expect(screen.queryByText("0 UZS")).not.toBeInTheDocument();
    expect(container.querySelector("canvas")).not.toBeInTheDocument();
    expect(screen.queryByText("187 450 000")).not.toBeInTheDocument();
    expect(screen.queryByText("Демо-база клиентов")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Аналитика" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Редактировать транзакцию transaction-uuid" })).toBeInTheDocument();
  });

  it("keeps the retained transaction loading state truthful", () => {
    vi.spyOn(dashboardApi, "getOrganizationTotal").mockResolvedValue(0);
    vi.spyOn(adminFinanceApi, "listTransactions").mockReturnValue(new Promise(() => {}));

    render(<DashboardPage onNotify={vi.fn()} />);

    expect(screen.getByText("Загрузка транзакций...")).toHaveAttribute("role", "status");
    expect(screen.queryByText("0 UZS")).not.toBeInTheDocument();
  });

  it("keeps the retained transaction error visible without substituting data", async () => {
    vi.spyOn(dashboardApi, "getOrganizationTotal").mockResolvedValue(0);
    const onNotify = vi.fn();
    vi.spyOn(adminFinanceApi, "listTransactions").mockRejectedValue(new Error("offline"));

    render(<DashboardPage onNotify={onNotify} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить транзакции.");
    await waitFor(() => expect(onNotify).toHaveBeenCalled());
    expect(screen.queryByText("0 UZS")).not.toBeInTheDocument();
  });

  it("distinguishes an Organization loading failure from an authoritative zero", async () => {
    vi.spyOn(dashboardApi, "getOrganizationTotal").mockRejectedValue(new Error("offline"));
    vi.spyOn(adminFinanceApi, "listTransactions").mockResolvedValue({ data: { items: [] } });
    render(<DashboardPage onNotify={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить количество организаций.");
    expect(screen.getByText("Не удалось загрузить")).toBeInTheDocument();
    expect(screen.queryByText("Канонический total")).not.toBeInTheDocument();
  });
});
