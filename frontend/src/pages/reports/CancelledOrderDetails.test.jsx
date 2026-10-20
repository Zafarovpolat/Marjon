import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { cancellationAcknowledgements } from "../../api/cancellationAcknowledgements";
import CancelledOrderDetails from "./CancelledOrderDetails";
import { isCancellationAcknowledged } from "../../hooks/useCancellationAcknowledgements";

vi.mock("../../api/cancellationAcknowledgements", () => ({
  cancellationAcknowledgements: { list: vi.fn(), acknowledge: vi.fn() },
}));
const order = { id: "order:o1", orderId: "o1", orderNumber: "22", quantity: 1, amount: 100,
  items: [{ id: "i1", orderNumber: "22", name: "Суп", quantity: 1, amount: 100, reportEventAt: "2026-10-20T05:00:00Z" }] };
beforeEach(() => {
  vi.clearAllMocks();
  cancellationAcknowledgements.list.mockResolvedValue({ data: [] });
  cancellationAcknowledgements.acknowledge.mockResolvedValue({ data: { order_id: "o1", acknowledged_at: "2026-10-20T06:00:00Z" } });
});
it("persists acknowledgement, prevents repeat clicks and keeps the order visible", async () => {
  render(<CancelledOrderDetails order={order} />);
  fireEvent.click(screen.getByRole("button", { name: "Ознакомлен" }));
  await screen.findByRole("button", { name: "Ознакомлен ✓" });
  expect(cancellationAcknowledgements.acknowledge).toHaveBeenCalledWith("o1");
  expect(cancellationAcknowledgements.acknowledge).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Ознакомлен ✓" })).toBeDisabled();
  expect(screen.getByText("Суп")).toBeInTheDocument();
});
it("does not mark a failed save as successful and allows retry", async () => {
  cancellationAcknowledgements.acknowledge.mockRejectedValueOnce(new Error("offline"));
  render(<CancelledOrderDetails order={order} />);
  fireEvent.click(screen.getByRole("button", { name: "Ознакомлен" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось сохранить");
  expect(screen.getByRole("button", { name: "Ознакомлен" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Ознакомлен" }));
  await screen.findByRole("button", { name: "Ознакомлен ✓" });
});
it("loads the saved acknowledgement after remount", async () => {
  cancellationAcknowledgements.list.mockResolvedValue({ data: [{ order_id: "o1", acknowledged_at: "2026-10-20T06:00:00Z" }] });
  render(<CancelledOrderDetails order={order} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Ознакомлен ✓" })).toBeDisabled());
});
it("does not hide a later cancellation in the same order", () => {
  expect(isCancellationAcknowledged({ o1: "2026-10-20T06:00:00Z" }, "o1", "2026-10-20T07:00:00Z")).toBe(false);
});
