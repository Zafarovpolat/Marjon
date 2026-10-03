import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Topbar from "./Topbar";

vi.mock("./BackButton", () => ({ default: () => <button type="button">Назад</button> }));
vi.mock("./topbar/TopbarRateWidget", () => ({ default: () => null }));
vi.mock("./topbar/TopbarNotifications", () => ({ default: () => null }));
vi.mock("./topbar/TopbarBalancePill", () => ({ default: () => null }));
vi.mock("./topbar/TopbarPaymentModal", () => ({ default: () => null }));
vi.mock("./topbar/useTopbarBalance", () => ({
  useTopbarBalance: () => ({ balance: 0, balanceLoading: false, balanceError: "" }),
}));

describe("OWNER Topbar date", () => {
  it("keeps the accepted date/time display read-only and never opens a calendar", () => {
    render(<Topbar selectedDate="2026-10-02" />);

    const date = screen.getByText("02.10.2026");
    const display = date.closest(".mj-datepicker__trigger");
    expect(display).toHaveAttribute("aria-label", expect.stringContaining("02.10.2026"));
    expect(display.tagName).toBe("DIV");
    expect(screen.queryByRole("dialog", { name: "Выбор даты" })).not.toBeInTheDocument();

    fireEvent.click(display);
    expect(screen.queryByRole("dialog", { name: "Выбор даты" })).not.toBeInTheDocument();
    expect(display.querySelector(".mj-datepicker__time")).toBeInTheDocument();
  });
});
