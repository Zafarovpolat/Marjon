import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import OrderStatus from "./OrderStatus";

it.each([
  ["new", "Новый", "new"], ["accepted", "В работе", "working"],
  ["cooking", "В работе", "working"], ["ready", "Готов", "ready"],
  ["completed", "Завершён", "completed"], ["cancelled", "Отменён", "cancelled"],
  ["unrecognized", "Неизвестен", "unknown"],
])("renders %s as Russian text with a coloured dot", (value, label, tone) => {
  const { container } = render(<OrderStatus value={value} />);
  expect(screen.getByText(label)).toHaveClass(`report-order-status--${tone}`);
  expect(container.querySelector(".report-order-status__dot")).toHaveAttribute("aria-hidden", "true");
});
it("does not fabricate a status when missing", () => {
  const { container } = render(<OrderStatus value={null} />);
  expect(screen.getByText("—")).toBeInTheDocument();
  expect(container.querySelector(".report-order-status__dot")).toBeNull();
});
