import FinanceCategoriesPage from "./FinanceCategoriesPage";

const rows = [
  { name: "Приход от продаж", description: "Автоматические приходы от заказов", operations: "125", total: "550 000 000 UZS" },
  { name: "Пополнение кассы", description: "Ручное пополнение", operations: "8", total: "12 000 000 UZS" },
  { name: "Возврат поставщика", description: "Возврат денег от поставщика", operations: "2", total: "1 400 000 UZS" },
];

function FinanceIncomeCategoriesPage() {
  return <FinanceCategoriesPage title="Категория приходов" kind="income" initialRows={rows} />;
}

export default FinanceIncomeCategoriesPage;
