import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ReceiptPreview from "./ReceiptPreview";
import ReceiptSeparatorSelect from "./ReceiptSeparatorSelect";
import { groupReceiptItems, rasterRuleGeometry } from "./receiptLayout";
import { buildCustomerTemplate, buildKitchenTemplate } from "../../api/receipt";

afterEach(cleanup);

it("shows cashier then waiter once each for a mixed-author customer receipt", () => {
  const order = { waiter: "Абдулазиз", receipt_staff: [
    { label: "Кассир", name: "Азиз" }, { label: "Официант", name: "Абдулазиз" },
  ] };
  render(<ReceiptPreview template={buildCustomerTemplate()} order={order} />);
  expect(screen.getByText("Кассир:").parentElement).toHaveTextContent("Азиз");
  expect(screen.getByText("Официант:").parentElement).toHaveTextContent("Абдулазиз");
  expect(screen.getAllByText("Абдулазиз")).toHaveLength(1);
});

it.each([["thin", 1], ["medium", 2], ["bold", 3]])("matches printer dash geometry at %s weight", (weight, thickness) => {
  const rule = rasterRuleGeometry({ pattern: "dashed", weight });
  expect(rule.width).toBe(545);
  expect(rule.thickness).toBe(thickness);
  expect(rule.path).toContain(`M0 0h11v${thickness}h-11Z`);
  expect(rule.path).toContain(`M18 0h11v${thickness}h-11Z`);
  expect(rule.path).toContain(`M540 0h5v${thickness}h-5Z`);
});

it("centers address and phone including legacy templates with hidden left alignment", () => {
  const template = { ...buildCustomerTemplate(), address: "Tashkent minor metro", phone: "+998 90 777 77 77" };
  template.enabled.address = template.enabled.phone = true;
  const view = render(<ReceiptPreview template={template} />);
  expect(screen.getByText(template.address)).toHaveStyle({ textAlign: "center", justifySelf: "stretch" });
  expect(screen.getByText(template.phone)).toHaveStyle({ textAlign: "center", justifySelf: "stretch" });
  expect(template.blockStyles.address.align).toBe("center");
  expect(template.blockStyles.phone.align).toBe("center");
  template.blockStyles.address = template.blockStyles.phone = { align: "left" };
  view.rerender(<ReceiptPreview template={template} />);
  expect(screen.getByText(template.address)).toHaveStyle({ textAlign: "center" });
  expect(screen.getByText(template.phone)).toHaveStyle({ textAlign: "center" });
});
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
    else expect(rule.querySelector("svg")).toHaveAttribute("viewBox", "0 0 545 2");
  });
});
