import { useState } from "react";
import { clampToToday, todayInputValue } from "../utils/date";
import BackButton from "./BackButton";
import DatePicker from "./DatePicker";
import TopbarRateWidget from "./topbar/TopbarRateWidget";
import TopbarNotifications from "./topbar/TopbarNotifications";
import TopbarBalancePill from "./topbar/TopbarBalancePill";
import TopbarPaymentModal from "./topbar/TopbarPaymentModal";
import { useTopbarBalance } from "./topbar/useTopbarBalance";

// Оркестратор верхней панели OWNER (FE-07B). Слева — навигация назад и выбор
// даты; справа — независимые виджеты (курсы, уведомления, баланс). Загрузка
// данных идёт через сервисный слой (FE-05), безопасность запросов сохранена (FE-06).
export default function Topbar({
  selectedDate,
  onSelectedDateChange,
}) {
  const [today] = useState(() => todayInputValue());
  const balance = useTopbarBalance();

  return (
    <>
      <header className="dashboard-topbar">
        <div className="topbar-left">
          <span className="topbar-back-slot">
            <BackButton className="dashboard-back-button--topbar-3d" iconName="bi-chevron-left" />
          </span>
          <span className="topbar-date-slot">
            <DatePicker
              value={selectedDate}
              max={today}
              onChange={(value) => onSelectedDateChange(clampToToday(value))}
            />
          </span>
        </div>
        <div className="topbar-actions">
          <TopbarRateWidget />
          <TopbarNotifications />
          <TopbarBalancePill
            balance={balance.balance}
            balanceLoading={balance.balanceLoading}
            balanceError={balance.balanceError}
            onOpenPayment={balance.openPayment}
          />
        </div>
      </header>
      <TopbarPaymentModal
        paymentOpen={balance.paymentOpen}
        setPaymentOpen={balance.setPaymentOpen}
        paymentStep={balance.paymentStep}
        paymentMethod={balance.paymentMethod}
        setPaymentMethod={balance.setPaymentMethod}
        closePayment={balance.closePayment}
        cardAmount={balance.cardAmount}
        setCardAmount={balance.setCardAmount}
        formatAmountInput={balance.formatAmountInput}
        cardNumber={balance.cardNumber}
        setCardNumber={balance.setCardNumber}
        maskCardNumber={balance.maskCardNumber}
        cardExpiry={balance.cardExpiry}
        setCardExpiry={balance.setCardExpiry}
        maskExpiry={balance.maskExpiry}
        offerAccepted={balance.offerAccepted}
        setOfferAccepted={balance.setOfferAccepted}
        cardValid={balance.cardValid}
      />
    </>
  );
}
