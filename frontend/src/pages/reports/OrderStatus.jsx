import "./orderStatus.css";

const statuses = {
  new: ["Новый", "new"],
  accepted: ["В работе", "working"],
  cooking: ["В работе", "working"],
  ready: ["Готов", "ready"],
  completed: ["Завершён", "completed"],
  cancelled: ["Отменён", "cancelled"],
};

export default function OrderStatus({ value }) {
  if (value == null || value === "") return <span>—</span>;
  const [label, tone] = statuses[value] || ["Неизвестен", "unknown"];
  return <span className={`report-order-status report-order-status--${tone}`}><span className="report-order-status__dot" aria-hidden="true" />{label}</span>;
}
