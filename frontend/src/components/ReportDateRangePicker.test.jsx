import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ReportDateRangePicker from "./ReportDateRangePicker";

describe("ReportDateRangePicker canonical Reports variant", () => {
  it("reuses the approved Z-report interaction and commits only through OK", () => {
    const onChange = vi.fn();
    const initialRange = {
      preset: "",
      start: "01.08.2026",
      end: "25.08.2026",
      startTime: "00:00",
      endTime: "00:00",
    };
    const { container } = render(
      <ReportDateRangePicker
        variant="canonical"
        value={initialRange}
        onChange={onChange}
        buttonAriaLabel="Период тестового отчёта"
      />,
    );

    const trigger = screen.getByRole("button", { name: "Период тестового отчёта" });
    expect(trigger).toHaveTextContent("01.08.2026 – 25.08.2026");
    expect(trigger.closest(".owner-reports__period.report-actions")).toBeInTheDocument();
    expect(trigger.querySelector("svg")).toBeInTheDocument();

    fireEvent.click(trigger);
    ["Сегодня", "Вчера", "Эта неделя", "Этот месяц", "Этот год"].forEach((preset) => {
      expect(screen.getByRole("button", { name: preset })).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Начало периода")).toHaveValue("01.08.2026");
    expect(screen.getByLabelText("Конец периода")).toHaveValue("25.08.2026");
    expect(screen.getByText("Время").closest(".report-date-calendar-shell")).toHaveAttribute("aria-hidden", "true");
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Начало периода"));
    expect(screen.getByRole("button", { name: "Год" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Месяц" })).toBeInTheDocument();
    expect(screen.getByText("Часы")).toBeInTheDocument();
    expect(screen.getByText("Минуты")).toBeInTheDocument();
    expect(container.querySelector(".is-range-start.is-selected")).toBeInTheDocument();
    expect(container.querySelector(".is-range-end.is-selected")).toBeInTheDocument();
    expect(container.querySelectorAll(".is-in-range").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "ОК" })[1]);
    expect(screen.queryByRole("button", { name: "Предыдущий месяц" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Сегодня" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "ОК" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ preset: "Сегодня", startTime: "00:00", endTime: "00:00" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes with Escape and restores focus to the trigger", async () => {
    render(
      <ReportDateRangePicker
        variant="canonical"
        value={{ start: "01.08.2026", end: "25.08.2026" }}
        onChange={vi.fn()}
        buttonAriaLabel="Период тестового отчёта"
      />,
    );

    const trigger = screen.getByRole("button", { name: "Период тестового отчёта" });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
