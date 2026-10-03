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
}) {
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
              readOnly
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
        returnFocusRef={balance.paymentTriggerRef}
        paymentStep={balance.paymentStep}
        paymentMethod={balance.paymentMethod}
        setPaymentMethod={balance.setPaymentMethod}
        openPaymentWindow={balance.openPaymentWindow}
        openConfirmation={balance.openConfirmation}
        backToPaymentMethods={balance.backToPaymentMethods}
        backToCardDetails={balance.backToCardDetails}
        closePayment={balance.closePayment}
        cardAmount={balance.cardAmount}
        setCardAmount={balance.setCardAmount}
        sanitizeAmountInput={balance.sanitizeAmountInput}
        formatAmountDisplay={balance.formatAmountDisplay}
        cardNumber={balance.cardNumber}
        setCardNumber={balance.setCardNumber}
        sanitizeCardNumberInput={balance.sanitizeCardNumberInput}
        formatCardNumberDisplay={balance.formatCardNumberDisplay}
        cardExpiry={balance.cardExpiry}
        setCardExpiry={balance.setCardExpiry}
        sanitizeExpiryInput={balance.sanitizeExpiryInput}
        formatExpiryDisplay={balance.formatExpiryDisplay}
        offerAccepted={balance.offerAccepted}
        setOfferAccepted={balance.setOfferAccepted}
        amountLeadingZero={balance.amountLeadingZero}
        cardNumberValid={balance.cardNumberValid}
        expiryInvalid={balance.expiryInvalid}
        cardValid={balance.cardValid}
      />
    </>
  );
}
