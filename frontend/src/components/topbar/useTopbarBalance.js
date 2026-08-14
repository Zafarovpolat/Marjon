import { useEffect, useState } from "react";
import { settingsService } from "../../api/settings";

// Состояние и логика баланса/оплаты Topbar (OWNER).
// Вынесено из Topbar.jsx (FE-07B) как хук: владеет состоянием, загружает баланс
// через settingsService (FE-05). Биллинг остаётся DEFERRED — оплата отключена,
// новые платёжные возможности НЕ добавляются.
export function useTopbarBalance() {
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("uzcard");
  const [paymentStep, setPaymentStep] = useState("method");
  const [cardAmount, setCardAmount] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [offerAccepted, setOfferAccepted] = useState(false);
  const [balance, setBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceError, setBalanceError] = useState("");

  useEffect(() => {
    setBalanceError("");
    settingsService.getBillingBalance()
      .then(({ data }) => {
        const value = Number(data?.balance ?? data?.amount);
        if (Number.isFinite(value)) {
          setBalance(value);
        } else {
          setBalance(null);
          setBalanceError("Backend не вернул баланс.");
        }
      })
      .catch((err) => {
        setBalance(null);
        setBalanceError(err.response?.data?.detail || "Баланс недоступен.");
      })
      .finally(() => setBalanceLoading(false));
  }, []);

  useEffect(() => {
    if (!paymentOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setPaymentOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [paymentOpen]);

  function openPayment() {
    setPaymentStep("method");
    setPaymentOpen(true);
  }

  function closePayment() {
    setPaymentOpen(false);
    setPaymentStep("method");
    setCardAmount("");
    setCardNumber("");
    setCardExpiry("");
    setOfferAccepted(false);
  }

  function maskCardNumber(value) {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  }

  function maskExpiry(value) {
    const prev = cardExpiry;
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (prev.endsWith("/") && value.length < prev.length) return digits.slice(0, 1);
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    if (digits.length === 2 && !prev.includes("/")) return `${digits}/`;
    return digits;
  }

  function formatAmountInput(value) {
    const digits = value.replace(/\D/g, "");
    if (!digits) return "";
    return Number(digits).toLocaleString("ru-RU");
  }

  const cardAmountDigits = cardAmount.replace(/\D/g, "");
  const cardNumberDigits = cardNumber.replace(/\s/g, "");
  const cardValid = cardAmountDigits.length > 0 && cardNumberDigits.length === 16 && cardExpiry.length === 5 && offerAccepted;

  return {
    balance,
    balanceLoading,
    balanceError,
    paymentOpen,
    setPaymentOpen,
    paymentMethod,
    setPaymentMethod,
    paymentStep,
    cardAmount,
    setCardAmount,
    cardNumber,
    setCardNumber,
    cardExpiry,
    setCardExpiry,
    offerAccepted,
    setOfferAccepted,
    cardValid,
    openPayment,
    closePayment,
    maskCardNumber,
    maskExpiry,
    formatAmountInput,
  };
}
