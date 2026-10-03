import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { settingsService } from "../../api/settings";
import {
  formatAmountDisplay,
  formatCardNumberDisplay,
  formatExpiryDisplay,
  hasAmountLeadingZero,
  isAmountValid,
  isCardNumberValid,
  isExpiryValid,
  isExpiryMonthInvalid,
  sanitizeAmountInput,
  sanitizeCardNumberInput,
  sanitizeExpiryInput,
  useTopbarBalance,
} from "./useTopbarBalance";

vi.mock("../../api/settings", () => ({
  settingsService: {
    getBillingBalance: vi.fn(),
  },
}));

describe("useTopbarBalance input model", () => {
  beforeEach(() => {
    settingsService.getBillingBalance.mockResolvedValue({ data: { balance: 0 } });
  });

  it("keeps raw digits separate from formatted display", () => {
    expect(sanitizeAmountInput("00490000 UZS")).toBe("00490000");
    expect(formatAmountDisplay("490000")).toBe("490 000");
    expect(sanitizeCardNumberInput("1234 1234-1234x123456")).toBe("1234123412341234");
    expect(formatCardNumberDisplay("1234123412341234")).toBe("1234 1234 1234 1234");
    expect(sanitizeExpiryInput("2903x9")).toBe("2903");
    expect(formatExpiryDisplay("2903")).toBe("29/03");
    expect(isExpiryMonthInvalid("2903")).toBe(true);
    expect(isExpiryMonthInvalid("1203")).toBe(false);
  });

  it("validates amount timing, Luhn checksum and MM/YY structure", () => {
    expect(isAmountValid("0")).toBe(false);
    expect(isAmountValid("000000")).toBe(false);
    expect(isAmountValid("490000")).toBe(true);
    expect(hasAmountLeadingZero("")).toBe(false);
    expect(hasAmountLeadingZero("01")).toBe(true);
    expect(hasAmountLeadingZero("490")).toBe(false);

    expect(isCardNumberValid("1234")).toBe(false);
    expect(isCardNumberValid("123456789012345")).toBe(false);
    expect(isCardNumberValid("4111111111111112")).toBe(false);
    expect(isCardNumberValid("4111111111111111")).toBe(true);

    expect(isExpiryValid("2323")).toBe(false);
    expect(isExpiryValid("0028")).toBe(false);
    expect(isExpiryValid("1328")).toBe(false);
    expect(isExpiryValid("1228")).toBe(true);
  });

  it("allows confirmation only for a fully valid local form and never requests payment", async () => {
    const { result } = renderHook(() => useTopbarBalance());
    await waitFor(() => expect(settingsService.getBillingBalance).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.openPaymentWindow();
      result.current.setCardAmount("490000");
      result.current.setCardNumber("4111111111111111");
      result.current.setCardExpiry("1228");
      result.current.setOfferAccepted(true);
    });

    expect(result.current.cardValid).toBe(true);
    act(() => result.current.openConfirmation());
    expect(result.current.paymentStep).toBe("confirm");
    expect(settingsService.getBillingBalance).toHaveBeenCalledTimes(1);

    act(() => result.current.backToCardDetails());
    expect(result.current.paymentStep).toBe("card");
    expect(result.current.cardNumber).toBe("4111111111111111");
  });

  it("clears sensitive values on close without a payment request", async () => {
    const { result } = renderHook(() => useTopbarBalance());
    await waitFor(() => expect(settingsService.getBillingBalance).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.setCardAmount("490000");
      result.current.setCardNumber("1234123412341234");
      result.current.setCardExpiry("1203");
      result.current.setOfferAccepted(true);
    });

    expect(result.current.cardNumber).toBe("1234123412341234");
    act(() => result.current.closePayment());

    expect(result.current.cardAmount).toBe("");
    expect(result.current.cardNumber).toBe("");
    expect(result.current.cardExpiry).toBe("");
    expect(result.current.offerAccepted).toBe(false);
    expect(settingsService.getBillingBalance).toHaveBeenCalledTimes(1);
  });
});
