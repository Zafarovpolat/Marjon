import FinanceCategoriesPage from "./FinanceCategoriesPage";

const rows = [
  { name: "Продажа в VIP", description: "Расходы/корректировки VIP", operations: "4", total: "100 000 000 UZS" },
  { name: "Закупка товаров", description: "Оплата поставщикам", operations: "18", total: "45 000 000 UZS" },
  { name: "Зарплата", description: "Выплаты сотрудникам", operations: "12", total: "30 000 000 UZS" },
  { name: "Аренда", description: "Ежемесячная аренда", operations: "1", total: "15 000 000 UZS" },
];

function FinanceExpenseCategoriesPage() {
  return <FinanceCategoriesPage title="Категория расходов" kind="expense" initialRows={rows} />;
}

export default FinanceExpenseCategoriesPage;
