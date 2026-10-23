import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ReceiptPreview from "./ReceiptPreview";
import ReceiptSeparatorSelect from "./ReceiptSeparatorSelect";
import { groupReceiptItems } from "./receiptLayout";
import { buildCustomerTemplate, buildKitchenTemplate } from "../../api/receipt";

afterEach(cleanup);
const lines = [1, 2, 3].map(id => ({ id, product_id: "hotdog", name: "Хот дог", quantity: 1, price: 14000, total: 14000 }));
const order = { order_number: "12", waiter: "Азиз", waiter_role: "cashier", created_at: "2026-10-23T12:40:00Z", items: lines, total_amount: 47040, service_fee: 5040 };

it.each(["customer", "kitchen"])("combines three identical dishes in the %s preview", type => {
  const template = type === "customer" ? buildCustomerTemplate() : buildKitchenTemplate();
  const { container } = render(<ReceiptPreview type={type} template={template} order={order} />);
  const rows = container.querySelectorAll(".receipt-preview__item-row");
  expect(rows).toHaveLength(1);
  expect(rows[0].children[0].textContent).toBe("Хот дог");
  expect(rows[0].children[1].textContent).toBe("3");
  expect(rows[0].children[2].textContent).toBe("42 000");
  expect(screen.getByText("Кассир:")).toBeInTheDocument();
  expect(container.textContent).toContain("23.10.26");
  expect(container.textContent).not.toContain("23.10.2026");
  expect(lines.every(row => row.quantity === 1)).toBe(true);
  if (type === "customer") {
    expect(screen.getByText("Обслуга 12%")).toBeInTheDocument();
    expect(screen.getByText("Итого:")).toBeInTheDocument();
  }
});

it.each([{ note: "Без лука" }, { modifiers: ["Сыр"] }, { course: 2 }, { product_id: "other" }, { price: 15000, total: 15000 }, { takeaway: true }])("does not combine different variants %j", change => {
  expect(groupReceiptItems([lines[0], { ...lines[1], ...change }])).toHaveLength(2);
});

it("offers nine separator options and emits their saved representation", () => {
  const onChange = vi.fn();
  render(<ReceiptSeparatorSelect onChange={onChange} />);
  fireEvent.click(screen.getByRole("combobox"));
  expect(screen.getAllByRole("option")).toHaveLength(9);
  fireEvent.click(screen.getAllByRole("option")[8]);
  expect(onChange).toHaveBeenCalledWith({ pattern: "stars", weight: "bold" });
});

it.each(["dashed", "solid", "stars"])("applies %s rules to every separator", pattern => {
  const { container } = render(<ReceiptPreview template={{ ...buildCustomerTemplate(), separator: { pattern, weight: "medium" } }} order={order} />);
  const rules = container.querySelectorAll(".receipt-preview__rule");
  expect(rules.length).toBeGreaterThan(3);
  rules.forEach(rule => {
    expect(rule).toHaveAttribute("data-separator-pattern", pattern);
    expect(rule).toHaveAttribute("data-separator-weight", "medium");
    if (pattern === "stars") expect(rule.textContent).toContain("* *");
  });
});
