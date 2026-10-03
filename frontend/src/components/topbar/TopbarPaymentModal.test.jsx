import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TopbarBalancePill from "./TopbarBalancePill";
import TopbarPaymentModal from "./TopbarPaymentModal";
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
} from "./useTopbarBalance";

vi.mock("../../hooks/useAnchoredDialogMotion", () => ({
  useAnchoredDialogMotion: ({ onClose }) => ({
    dialogRef: { current: null },
    motionClassName: "owner-modal-motion owner-modal-motion--centered is-motion-ready",
    motionStyle: undefined,
    requestClose: onClose,
    handleAnimationEnd: vi.fn(),
  }),
}));

function renderModal(overrides = {}) {
  const props = {
    paymentOpen: true,
    returnFocusRef: { current: null },
    paymentStep: "method",
    paymentMethod: "uzcard",
    setPaymentMethod: vi.fn(),
    openPaymentWindow: vi.fn(),
    openConfirmation: vi.fn(),
    backToPaymentMethods: vi.fn(),
    backToCardDetails: vi.fn(),
    closePayment: vi.fn(),
    cardAmount: "",
    setCardAmount: vi.fn(),
    sanitizeAmountInput,
    formatAmountDisplay,
    cardNumber: "",
    setCardNumber: vi.fn(),
    sanitizeCardNumberInput,
    formatCardNumberDisplay,
    cardExpiry: "",
    setCardExpiry: vi.fn(),
    sanitizeExpiryInput,
    formatExpiryDisplay,
    offerAccepted: false,
    setOfferAccepted: vi.fn(),
    amountLeadingZero: false,
    cardNumberValid: false,
    expiryInvalid: false,
    cardValid: false,
    ...overrides,
  };

  render(<TopbarPaymentModal {...props} />);
  return props;
}

function PaymentHarness({
  initialStep = "method",
  initialAmount = "",
  initialCardNumber = "",
  initialExpiry = "",
  initialOfferAccepted = false,
}) {
  const [paymentStep, setPaymentStep] = useState(initialStep);
  const [cardAmount, setCardAmount] = useState(initialAmount);
  const [cardNumber, setCardNumber] = useState(initialCardNumber);
  const [cardExpiry, setCardExpiry] = useState(initialExpiry);
  const [offerAccepted, setOfferAccepted] = useState(initialOfferAccepted);
  const amountValid = isAmountValid(cardAmount);
  const cardNumberValid = isCardNumberValid(cardNumber);
  const expiryValid = isExpiryValid(cardExpiry);
  const cardValid = amountValid && cardNumberValid && expiryValid && offerAccepted;

  return (
    <>
      <output data-testid="raw-payment-values">{`${cardAmount}|${cardNumber}|${cardExpiry}`}</output>
      <TopbarPaymentModal
        paymentOpen
        returnFocusRef={{ current: null }}
        paymentStep={paymentStep}
        paymentMethod="uzcard"
        setPaymentMethod={vi.fn()}
        openPaymentWindow={() => setPaymentStep("card")}
        openConfirmation={() => {
          if (cardValid) setPaymentStep("confirm");
        }}
        backToPaymentMethods={() => setPaymentStep("method")}
        backToCardDetails={() => setPaymentStep("card")}
        closePayment={vi.fn()}
        cardAmount={cardAmount}
        setCardAmount={setCardAmount}
        sanitizeAmountInput={sanitizeAmountInput}
        formatAmountDisplay={formatAmountDisplay}
        cardNumber={cardNumber}
        setCardNumber={setCardNumber}
        sanitizeCardNumberInput={sanitizeCardNumberInput}
        formatCardNumberDisplay={formatCardNumberDisplay}
        cardExpiry={cardExpiry}
        setCardExpiry={setCardExpiry}
        sanitizeExpiryInput={sanitizeExpiryInput}
        formatExpiryDisplay={formatExpiryDisplay}
        offerAccepted={offerAccepted}
        setOfferAccepted={setOfferAccepted}
        amountLeadingZero={hasAmountLeadingZero(cardAmount)}
        cardNumberValid={cardNumberValid}
        expiryInvalid={isExpiryMonthInvalid(cardExpiry)}
        cardValid={cardValid}
      />
    </>
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OWNER balance payment flow", () => {
  it("opens from the Balance button and preserves its trigger for focus return", () => {
    const openPayment = vi.fn();
    render(
      <TopbarBalancePill
        balance={0}
        balanceLoading={false}
        balanceError=""
        onOpenPayment={openPayment}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Баланс" });
    fireEvent.click(trigger);
    expect(openPayment).toHaveBeenCalledWith(trigger);
  });

  it("shows UzCard / Humo by default and exposes the recovered CTA", () => {
    renderModal();

    expect(screen.getByRole("dialog", { name: "Оплата" })).toBeInTheDocument();
    expect(screen.getByTestId("balance-payment-header").querySelector("hr")).toBeNull();
    expect(screen.getByTestId("balance-step-one")).toHaveClass("is-current");
    expect(screen.getByTestId("balance-step-one")).toHaveAttribute("aria-current", "step");
    expect(screen.getByTestId("balance-step-two")).not.toHaveClass("is-current");
    expect(screen.getByTestId("balance-step-three")).not.toHaveClass("is-current");
    expect(screen.getByTestId("balance-step-connector-one")).not.toHaveClass("is-filled");
    expect(screen.getByTestId("balance-step-connector-two")).not.toHaveClass("is-filled");
    expect(screen.queryByRole("button", { name: "Вернуться к выбору способа оплаты" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Назад к выбору способа оплаты" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /UzCard \/ Humo/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Visa \/ Mastercard/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: "Оплатить" })).toBeEnabled();
    expect(screen.queryByText(/Платёжный процессор пока не подключён/)).not.toBeInTheDocument();
  });

  it("switches the selected method and invokes the recovered payment-window action", () => {
    const props = renderModal();

    fireEvent.click(screen.getByRole("radio", { name: /Visa \/ Mastercard/ }));
    expect(props.setPaymentMethod).toHaveBeenCalledWith("visa");

    fireEvent.click(screen.getByRole("button", { name: "Оплатить" }));
    expect(props.openPaymentWindow).toHaveBeenCalledTimes(1);
  });

  it("transfers Visa / Mastercard to the existing card step without fake payment state", () => {
    renderModal({ paymentStep: "card", paymentMethod: "visa" });

    expect(screen.getByRole("dialog", { name: "Оплата" })).toBeInTheDocument();
    expect(screen.getByText("Выбранный способ оплаты: Visa / Mastercard")).toBeInTheDocument();
    expect(screen.getByText("MARJON")).toBeInTheDocument();
    expect(screen.getByTestId("balance-brand-logo")).toHaveAttribute("src", expect.stringMatching(/^data:image\/svg\+xml/));
    expect(screen.getByText("Удобное пополнение баланса")).toBeInTheDocument();
    expect(screen.queryByText("MARJON RESTAURANT")).not.toBeInTheDocument();
    expect(screen.queryByText("Рустам")).not.toBeInTheDocument();
    expect(screen.queryByText(/успеш/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Платёжный процессор/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Вернуться к выбору способа оплаты" })).toHaveClass("is-complete");
    expect(screen.getByTestId("balance-step-two")).toHaveClass("is-current");
    expect(screen.getByTestId("balance-step-three")).not.toHaveClass("is-current");
    expect(screen.getByTestId("balance-step-connector-one")).toHaveClass("is-filled");
    expect(screen.getByTestId("balance-step-connector-two")).not.toHaveClass("is-filled");
    expect(screen.queryByRole("button", { name: "Назад к выбору способа оплаты" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Введите сумму")).toBeEnabled();
    expect(screen.getByPlaceholderText("0000 0000 0000 0000")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Перейти к подтверждению" })).toBeDisabled();
  });

  it("supports back and close on the payment window", () => {
    const props = renderModal({ paymentStep: "card" });

    fireEvent.click(screen.getByRole("button", { name: "Вернуться к выбору способа оплаты" }));
    expect(props.backToPaymentMethods).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(props.closePayment).toHaveBeenCalledTimes(1);
  });

  it("supports Enter and Space on completed Step 1 without making Step 2 skippable", async () => {
    const props = renderModal({ paymentStep: "card" });
    const user = userEvent.setup();
    const completedStep = screen.getByRole("button", { name: "Вернуться к выбору способа оплаты" });

    completedStep.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(props.backToPaymentMethods).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("balance-step-two").tagName).toBe("SPAN");
    expect(screen.getByTestId("balance-step-three").tagName).toBe("SPAN");
  });

  it("keeps all three steps teal on confirmation and exposes only completed-step navigation", async () => {
    const props = renderModal({
      paymentStep: "confirm",
      cardAmount: "490000",
      cardNumber: "4111111111111111",
      cardExpiry: "1228",
      cardNumberValid: true,
      cardValid: true,
    });
    const user = userEvent.setup();

    expect(screen.getByRole("button", { name: "Вернуться к выбору способа оплаты" })).toHaveClass("is-complete");
    expect(screen.getByRole("button", { name: "Вернуться к данным карты" })).toHaveClass("is-complete");
    expect(screen.getByTestId("balance-step-three")).toHaveClass("is-current");
    expect(screen.getByTestId("balance-step-connector-one")).toHaveClass("is-filled");
    expect(screen.getByTestId("balance-step-connector-two")).toHaveClass("is-filled");

    fireEvent.click(screen.getByRole("button", { name: "Вернуться к выбору способа оплаты" }));
    expect(props.backToPaymentMethods).toHaveBeenCalledTimes(1);

    const stepTwo = screen.getByRole("button", { name: "Вернуться к данным карты" });
    stepTwo.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(props.backToCardDetails).toHaveBeenCalledTimes(2);
  });

  it("animates forward and backward content without scaling the dialog", () => {
    vi.useFakeTimers();
    render(<PaymentHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Оплатить" }));
    expect(document.querySelector('[data-payment-step="method"]')).toHaveClass("balance-step-motion--exit-forward");

    act(() => vi.advanceTimersByTime(100));
    expect(document.querySelector('[data-payment-step="card"]')).toHaveClass("balance-step-motion--enter-forward");
    expect(document.querySelector('[data-payment-step="card"]')).not.toHaveClass(/scale/);

    act(() => vi.advanceTimersByTime(100));
    fireEvent.click(screen.getByRole("button", { name: "Вернуться к выбору способа оплаты" }));
    expect(document.querySelector('[data-payment-step="card"]')).toHaveClass("balance-step-motion--exit-backward");

    act(() => vi.advanceTimersByTime(100));
    expect(document.querySelector('[data-payment-step="method"]')).toHaveClass("balance-step-motion--enter-backward");
  });

  it("animates card details forward to confirmation and back through Step 2", () => {
    vi.useFakeTimers();
    render(
      <PaymentHarness
        initialStep="card"
        initialAmount="490000"
        initialCardNumber="4111111111111111"
        initialExpiry="1228"
        initialOfferAccepted
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Перейти к подтверждению" }));
    expect(document.querySelector('[data-payment-step="card"]')).toHaveClass("balance-step-motion--exit-forward");
    act(() => vi.advanceTimersByTime(100));
    expect(document.querySelector('[data-payment-step="confirm"]')).toHaveClass("balance-step-motion--enter-forward");

    act(() => vi.advanceTimersByTime(100));
    fireEvent.click(screen.getByRole("button", { name: "Вернуться к данным карты" }));
    expect(document.querySelector('[data-payment-step="confirm"]')).toHaveClass("balance-step-motion--exit-backward");
    act(() => vi.advanceTimersByTime(100));
    expect(document.querySelector('[data-payment-step="card"]')).toHaveClass("balance-step-motion--enter-backward");
  });

  it("keeps the modal shell, brand, header, stepper and CTA mounted while only inner content changes", () => {
    vi.useFakeTimers();
    render(<PaymentHarness />);

    const dialog = screen.getByRole("dialog", { name: "Оплата" });
    const shell = screen.getByTestId("balance-payment-shell");
    const brand = screen.getByTestId("balance-brand-logo").closest("aside");
    const header = screen.getByTestId("balance-payment-header");
    const stepper = screen.getByTestId("balance-payment-stepper-shell");
    const cta = screen.getByTestId("balance-payment-cta");

    expect(cta).toHaveTextContent("Оплатить");
    expect(cta).toHaveClass("balance-payment-shell__cta");
    expect(cta).toBeEnabled();
    expect(dialog.querySelector("hr")).not.toBeInTheDocument();

    fireEvent.click(cta);
    act(() => vi.advanceTimersByTime(100));

    expect(screen.getByRole("dialog", { name: "Оплата" })).toBe(dialog);
    expect(screen.getByTestId("balance-payment-shell")).toBe(shell);
    expect(screen.getByTestId("balance-brand-logo").closest("aside")).toBe(brand);
    expect(screen.getByTestId("balance-payment-header")).toBe(header);
    expect(screen.getByTestId("balance-payment-stepper-shell")).toBe(stepper);
    expect(screen.getByTestId("balance-payment-cta")).toBe(cta);
    expect(cta).toHaveTextContent("Перейти к подтверждению");
    expect(cta).toBeDisabled();
    expect(screen.queryByText(/Платёжный процессор/)).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(100));
    fireEvent.click(screen.getByRole("button", { name: "Вернуться к выбору способа оплаты" }));
    act(() => vi.advanceTimersByTime(200));

    expect(screen.getByTestId("balance-payment-cta")).toBe(cta);
    expect(cta).toHaveTextContent("Оплатить");
    expect(cta).toBeEnabled();
  });

  it("switches steps immediately when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    render(<PaymentHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Оплатить" }));
    expect(document.querySelector('[data-payment-step="card"]')).toBeInTheDocument();
    expect(document.querySelector('[data-payment-step="card"]')).not.toHaveClass("balance-step-motion--enter-forward");
  });

  it("formats raw amount, card and expiry values while keeping fields editable", () => {
    render(<PaymentHarness initialStep="card" />);

    const amount = screen.getByPlaceholderText("Введите сумму");
    const card = screen.getByPlaceholderText("0000 0000 0000 0000");
    const expiry = screen.getByPlaceholderText("ММ/ГГ");

    fireEvent.change(amount, { target: { value: "490000abc" } });
    fireEvent.change(card, { target: { value: "1234-1234 1234x123456" } });
    fireEvent.change(expiry, { target: { value: "2903x" } });

    expect(amount).toHaveValue("490 000");
    expect(card).toHaveValue("1234 1234 1234 1234");
    expect(expiry).toHaveValue("29/03");
    expect(expiry).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("raw-payment-values")).toHaveTextContent("490000|1234123412341234|2903");
  });

  it("keeps incomplete fields neutral and shows errors only at the V6 validation boundaries", () => {
    render(<PaymentHarness initialStep="card" />);

    const amount = screen.getByPlaceholderText("Введите сумму");
    const card = screen.getByPlaceholderText("0000 0000 0000 0000");
    const expiry = screen.getByPlaceholderText("ММ/ГГ");
    const cta = screen.getByRole("button", { name: "Перейти к подтверждению" });

    expect(amount).not.toHaveAttribute("aria-invalid");
    expect(card).not.toHaveAttribute("aria-invalid");
    expect(expiry).not.toHaveAttribute("aria-invalid");
    expect(cta).toBeDisabled();

    for (const partialAmount of ["4", "49", "490", "490000"]) {
      fireEvent.change(amount, { target: { value: partialAmount } });
      expect(amount).not.toHaveAttribute("aria-invalid");
    }
    expect(amount).toHaveValue("490 000");
    for (const leadingZeroAmount of ["0", "0123", "000500"]) {
      fireEvent.change(amount, { target: { value: leadingZeroAmount } });
      expect(amount).toHaveAttribute("aria-invalid", "true");
    }
    expect(amount).toHaveValue("000 500");
    fireEvent.change(amount, { target: { value: "123" } });
    expect(amount).not.toHaveAttribute("aria-invalid");

    for (const partialCard of ["4", "41111", "411111111111111"]) {
      fireEvent.change(card, { target: { value: partialCard } });
      expect(card).not.toHaveAttribute("aria-invalid");
    }
    fireEvent.change(card, { target: { value: "4111111111111112" } });
    expect(card).toHaveValue("4111 1111 1111 1112");
    expect(card).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(card, { target: { value: "411111111111111" } });
    expect(card).not.toHaveAttribute("aria-invalid");
    fireEvent.change(card, { target: { value: "4111111111111111" } });
    expect(card).not.toHaveAttribute("aria-invalid");

    fireEvent.change(expiry, { target: { value: "1" } });
    expect(expiry).not.toHaveAttribute("aria-invalid");
    for (const invalidExpiry of ["00", "13", "23", "2323"]) {
      fireEvent.change(expiry, { target: { value: invalidExpiry } });
      expect(expiry).toHaveAttribute("aria-invalid", "true");
    }
    fireEvent.change(expiry, { target: { value: "1223" } });
    expect(expiry).toHaveValue("12/23");
    expect(expiry).not.toHaveAttribute("aria-invalid");
    for (const incompleteValidMonth of ["12", "120"]) {
      fireEvent.change(expiry, { target: { value: incompleteValidMonth } });
      expect(expiry).not.toHaveAttribute("aria-invalid");
    }
    fireEvent.change(expiry, { target: { value: "1228" } });
    expect(expiry).toHaveValue("12/28");
    expect(expiry).not.toHaveAttribute("aria-invalid");
    expect(cta).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(cta).toBeEnabled();
  });

  it("supports quick amounts and natural end-of-value backspace", () => {
    render(<PaymentHarness initialStep="card" />);

    fireEvent.click(screen.getByRole("button", { name: "390 000" }));
    expect(screen.getByPlaceholderText("Введите сумму")).toHaveValue("390 000");

    fireEvent.click(screen.getByRole("button", { name: "490 000" }));
    expect(screen.getByPlaceholderText("Введите сумму")).toHaveValue("490 000");

    fireEvent.click(screen.getByRole("button", { name: "1 000 000" }));
    expect(screen.getByPlaceholderText("Введите сумму")).toHaveValue("1 000 000");

    const card = screen.getByPlaceholderText("0000 0000 0000 0000");
    fireEvent.change(card, { target: { value: "1234 1234 1234 1234" } });
    fireEvent.change(card, { target: { value: "1234 1234 1234 123" } });
    expect(card).toHaveValue("1234 1234 1234 123");
    expect(screen.getByTestId("raw-payment-values")).toHaveTextContent("1000000|123412341234123|");
  });

  it("keeps formatted card caret semantics for middle insert, Backspace, Delete and range replacement", async () => {
    const user = userEvent.setup();
    render(<PaymentHarness initialStep="card" />);
    const card = screen.getByPlaceholderText("0000 0000 0000 0000");

    fireEvent.change(card, { target: { value: "561812924940644" } });
    card.focus();
    card.setSelectionRange(11, 11);
    await user.keyboard("7");
    expect(card).toHaveValue("5618 1292 4794 0644");
    expect(card.selectionStart).toBe(12);
    expect(card.selectionEnd).toBe(12);

    fireEvent.change(card, { target: { value: "5618129249406444" } });
    card.setSelectionRange(10, 10);
    await user.keyboard("{Backspace}");
    expect(card).toHaveValue("5618 1294 9406 444");
    expect(card.selectionStart).toBe(8);

    fireEvent.change(card, { target: { value: "5618129249406444" } });
    card.setSelectionRange(9, 9);
    await user.keyboard("{Delete}");
    expect(card).toHaveValue("5618 1292 9406 444");
    expect(card.selectionStart).toBe(10);

    fireEvent.change(card, { target: { value: "5618129249406444" } });
    card.setSelectionRange(10, 14);
    await user.keyboard("1234");
    expect(card).toHaveValue("5618 1292 1234 6444");
    expect(card.selectionStart).toBe(15);
  });

  it("replaces selected card digits from paste, strips non-digits and keeps the 16-digit cap", () => {
    render(<PaymentHarness initialStep="card" initialCardNumber="5618129249406444" />);
    const card = screen.getByPlaceholderText("0000 0000 0000 0000");

    card.setSelectionRange(10, 14);
    fireEvent.paste(card, { clipboardData: { getData: () => "12-34" } });
    expect(card).toHaveValue("5618 1292 1234 6444");
    expect(card.selectionStart).toBe(15);

    card.setSelectionRange(0, card.value.length);
    fireEvent.paste(card, { clipboardData: { getData: () => "5618 1292 4940 6444 extra 9999" } });
    expect(card).toHaveValue("5618 1292 4940 6444");
    expect(screen.getByTestId("raw-payment-values")).toHaveTextContent("|5618129249406444|");
  });

  it("revalidates a complete card after a middle edit and clears red while incomplete", async () => {
    const user = userEvent.setup();
    render(<PaymentHarness initialStep="card" initialCardNumber="4111111111111111" />);
    const card = screen.getByPlaceholderText("0000 0000 0000 0000");

    expect(card).not.toHaveAttribute("aria-invalid");
    card.focus();
    card.setSelectionRange(18, 19);
    await user.keyboard("2");
    expect(card).toHaveValue("4111 1111 1111 1112");
    expect(card).toHaveAttribute("aria-invalid", "true");

    card.setSelectionRange(18, 19);
    await user.keyboard("1");
    expect(card).toHaveValue("4111 1111 1111 1111");
    expect(card).not.toHaveAttribute("aria-invalid");

    card.setSelectionRange(10, 10);
    await user.keyboard("{Backspace}");
    expect(card.value.replaceAll(" ", "")).toHaveLength(15);
    expect(card).not.toHaveAttribute("aria-invalid");
  });

  it("keeps card edits memory-only without logging, persistence or API activity", () => {
    const fetchSpy = vi.fn();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetchSpy);
    render(<PaymentHarness initialStep="card" initialCardNumber="5618129249406444" />);
    const card = screen.getByPlaceholderText("0000 0000 0000 0000");

    card.setSelectionRange(10, 14);
    fireEvent.paste(card, { clipboardData: { getData: () => "1234" } });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(storageSpy).not.toHaveBeenCalled();
  });

  it("keeps the offer checkbox semantic and toggles its checked state", () => {
    render(<PaymentHarness initialStep="card" />);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("shows a masked confirmation summary and keeps the final CTA non-processing", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    render(<PaymentHarness initialStep="card" />);

    fireEvent.change(screen.getByPlaceholderText("Введите сумму"), { target: { value: "490000" } });
    fireEvent.change(screen.getByPlaceholderText("0000 0000 0000 0000"), { target: { value: "4111111111111111" } });
    fireEvent.change(screen.getByPlaceholderText("ММ/ГГ"), { target: { value: "1228" } });
    fireEvent.click(screen.getByRole("checkbox"));

    const confirmationCta = screen.getByRole("button", { name: "Перейти к подтверждению" });
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(confirmationCta).toBeEnabled();
    fireEvent.click(confirmationCta);

    expect(screen.getByText("UzCard / Humo")).toBeInTheDocument();
    expect(screen.getByText("490 000 UZS")).toBeInTheDocument();
    expect(screen.getByTestId("balance-masked-card")).toHaveTextContent("•••• •••• •••• 1111");
    expect(screen.queryByText("4111 1111 1111 1111")).not.toBeInTheDocument();
    expect(screen.getByText("12/28")).toBeInTheDocument();
    expect(screen.queryByText("Онлайн-оплата будет доступна после подключения платёжного сервиса.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Вернуться к данным карты" }));
    expect(screen.getByPlaceholderText("Введите сумму")).toHaveValue("490 000");
    expect(screen.getByPlaceholderText("0000 0000 0000 0000")).toHaveValue("4111 1111 1111 1111");
    expect(screen.getByPlaceholderText("ММ/ГГ")).toHaveValue("12/28");
    expect(screen.getByRole("checkbox")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Перейти к подтверждению" }));

    const finalCta = screen.getByRole("button", { name: "Оплатить" });
    expect(finalCta).toBeDisabled();
    fireEvent.click(finalCta);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/успеш/i)).not.toBeInTheDocument();
  });

  it("keeps the future success visual unreachable but gives its Close action the primary full-width CTA contract", () => {
    const props = renderModal({ paymentStep: "success" });

    expect(screen.getByRole("status")).toHaveTextContent("Платёж принят в обработку");
    expect(screen.getByRole("status")).toHaveTextContent("Мы уведомим вас после завершения операции.");
    expect(screen.getByRole("status").querySelector("svg")).toBeInTheDocument();

    const closeButtons = screen.getAllByRole("button", { name: "Закрыть" });
    const successClose = closeButtons.find((button) => button.dataset.testid === "balance-payment-cta");
    expect(successClose).toHaveClass("balance-payment-submit", "balance-payment-submit--wide", "balance-payment-shell__cta");
    expect(successClose).toBeEnabled();

    fireEvent.click(successClose);
    expect(props.closePayment).toHaveBeenCalledTimes(1);
  });
});
