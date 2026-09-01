import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardPage } from "./AdminDashboard";
import { adminFinanceApi } from "./financeApi";

const legacyDashboardLabels = [
  "Оборот за месяц",
  "Всего организаций",
  "Выполненная работа",
  "Оплаченная сумма",
  "Не оплачено",
  "Динамика оборота платформы",
];

describe("HQ-DASH-02 truthful dashboard shell", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders the deliberate shell and only authoritative HQ transaction fields", async () => {
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

    expect(await screen.findByText("Server Organization")).toBeInTheDocument();
    expect(screen.getByText("Server Counterparty")).toBeInTheDocument();
    expect(screen.getByText("125 000")).toBeInTheDocument();
    expect(screen.getByText("Приход")).toBeInTheDocument();
    expect(screen.getByText("Subscription")).toBeInTheDocument();

    legacyDashboardLabels.forEach((label) => {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    });
    expect(screen.queryByText("PAID")).not.toBeInTheDocument();
    expect(screen.queryByText("0 UZS")).not.toBeInTheDocument();
    expect(container.querySelector("canvas")).not.toBeInTheDocument();
    expect(container.querySelector(".admin-chart-card")).not.toBeInTheDocument();
    expect(container.querySelector(".admin-chart-filter-bar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Аналитика" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Редактировать транзакцию/ })).not.toBeInTheDocument();
  });

  it("keeps the retained transaction loading state truthful", () => {
    vi.spyOn(adminFinanceApi, "listTransactions").mockReturnValue(new Promise(() => {}));

    render(<DashboardPage onNotify={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Загрузка транзакций...");
    expect(screen.queryByText("0 UZS")).not.toBeInTheDocument();
  });

  it("keeps the retained transaction error visible without substituting data", async () => {
    const onNotify = vi.fn();
    vi.spyOn(adminFinanceApi, "listTransactions").mockRejectedValue(new Error("offline"));

    render(<DashboardPage onNotify={onNotify} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить транзакции.");
    await waitFor(() => expect(onNotify).toHaveBeenCalled());
    expect(screen.queryByText("0 UZS")).not.toBeInTheDocument();
  });
});
