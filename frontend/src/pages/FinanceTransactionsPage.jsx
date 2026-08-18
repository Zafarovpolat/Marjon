import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { financeService, resolveTransactionSubmission } from "../api/finance";
import Icon from "../components/Icon";
import FinanceTransactionDrawer from "./FinanceTransactionDrawer";
import ReportDateRangePicker from "../components/ReportDateRangePicker";
import { exportToExcel } from "../utils/excel";
import { isAbortError, isOrderedDateRange, useLatestRequest, useMutationLocks } from "../hooks/useAsyncSafety";

const emptyForm = {
  type: "income",
  amount: "",
  paymentTypeId: "",
  counterpartyId: "",
  categoryId: "",
  financeTemplateId: "",
  comment: "",
};

function currentMonthRange() {
  const now = new Date();
  return {
    preset: "Этот месяц",
    start: `01.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`,
    end: `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`,
    startTime: "",
    endTime: "",
  };
}

function toApiDate(value) {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [day, month, year] = value.split(".");
  return `${year}-${month}-${day}`;
}

function parseAmount(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

function formatMoney(value) {
  return `${new Intl.NumberFormat("ru-RU").format(Number(value))} UZS`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : `${date.toLocaleDateString("ru-RU")} / ${date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

function itemsOf(response) {
  const data = response?.data;
  return Array.isArray(data) ? data : data?.items || [];
}

function labelFor(id, labels) {
  if (!id) return "—";
  return labels.get(String(id)) || "Недоступно";
}

function mapTransactions(items, paymentTypes, categories, counterparties) {
  const paymentLabels = new Map(paymentTypes.map((item) => [String(item.id), item.name]));
  const categoryLabels = new Map(categories.map((item) => [String(item.id), item.name]));
  const counterpartyLabels = new Map(counterparties.map((item) => [String(item.id), item.full_name]));
  return items.map((tx) => ({
    id: String(tx.id),
    date: tx.date,
    amount: Number(tx.amount),
    type: tx.direction,
    paymentTypeId: tx.payment_type_id ? String(tx.payment_type_id) : "",
    counterpartyId: tx.counterparty_id ? String(tx.counterparty_id) : "",
    categoryId: tx.category_id ? String(tx.category_id) : "",
    financeTemplateId: tx.finance_template_id ? String(tx.finance_template_id) : "",
    paymentType: labelFor(tx.payment_type_id, paymentLabels),
    counterparty: labelFor(tx.counterparty_id, counterpartyLabels),
    category: labelFor(tx.category_id, categoryLabels),
    comment: tx.comment ?? "",
  }));
}

export default function FinanceTransactionsPage() {
  const [rows, setRows] = useState([]);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [counterparties, setCounterparties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [direction, setDirection] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [dateRange, setDateRange] = useState(currentMonthRange);
  const beginRequest = useLatestRequest();
  const mutationLocks = useMutationLocks();
  const createSubmissionRef = useRef(null);

  const loadData = useCallback(async ({ showLoader = true } = {}) => {
    const request = beginRequest();
    if (showLoader) setLoading(true);
    setError("");
    const params = { date_from: toApiDate(dateRange.start), date_to: toApiDate(dateRange.end) };
    if (!isOrderedDateRange(params.date_from, params.date_to)) {
      if (request.isCurrent()) {
        setRows([]);
        setError("Начальная дата не может быть позже конечной.");
        if (showLoader) setLoading(false);
      }
      return false;
    }
    if (direction !== "all") params.direction = direction;
    const [transactionsResult, paymentsResult, categoriesResult, counterpartiesResult] = await Promise.allSettled([
      financeService.listTransactions({ dateFrom: params.date_from, dateTo: params.date_to, direction: params.direction, signal: request.signal }),
      financeService.listPaymentTypes({ signal: request.signal }),
      financeService.listTransactionCategories(undefined, { signal: request.signal }),
      financeService.listCounterparties({ signal: request.signal }),
    ]);
    if (!request.isCurrent()) return false;
    if (transactionsResult.status === "rejected") {
      const err = transactionsResult.reason;
      if (isAbortError(err)) return false;
      setRows([]);
      setError(err.response?.data?.detail || "Не удалось загрузить финансовые транзакции.");
      if (showLoader) setLoading(false);
      return false;
    }
    if (!Array.isArray(transactionsResult.value?.data?.items)) {
      setRows([]);
      setError("Не удалось проверить формат финансовых транзакций.");
      if (showLoader) setLoading(false);
      return false;
    }
    const nextPaymentTypes = paymentsResult.status === "fulfilled" ? itemsOf(paymentsResult.value) : [];
    const nextCategories = categoriesResult.status === "fulfilled" ? itemsOf(categoriesResult.value) : [];
    const nextCounterparties = counterpartiesResult.status === "fulfilled" ? itemsOf(counterpartiesResult.value) : [];
    setPaymentTypes(nextPaymentTypes);
    setCategories(nextCategories);
    setCounterparties(nextCounterparties);
    setRows(mapTransactions(transactionsResult.value.data.items, nextPaymentTypes, nextCategories, nextCounterparties));
    if (showLoader) setLoading(false);
    return true;
  }, [beginRequest, dateRange.start, dateRange.end, direction]);

  useEffect(() => { loadData(); }, [loadData]);

  const totals = useMemo(() => rows.reduce((acc, row) => {
    acc[row.type] += row.amount;
    return acc;
  }, { income: 0, expense: 0 }), [rows]);

  const openCreate = (type) => {
    createSubmissionRef.current = null;
    setEditingId(null);
    setMutationError("");
    setForm({ ...emptyForm, type });
    setDrawerOpen(true);
  };

  const openEdit = (row) => {
    createSubmissionRef.current = null;
    setEditingId(row.id);
    setMutationError("");
    setForm({
      type: row.type,
      amount: String(row.amount),
      paymentTypeId: row.paymentTypeId,
      counterpartyId: row.counterpartyId,
      categoryId: row.categoryId,
      financeTemplateId: row.financeTemplateId,
      comment: row.comment,
    });
    setDrawerOpen(true);
  };

  const save = async () => {
    if (!mutationLocks.acquire("transaction-save")) return;
    const amount = parseAmount(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMutationError("Введите положительную сумму.");
      mutationLocks.release("transaction-save");
      return;
    }
    setSaving(true);
    setMutationError("");
    const payload = { amount, direction: form.type, comment: form.comment };
    if (form.categoryId) payload.category_id = form.categoryId;
    if (editingId) {
      if (form.financeTemplateId) payload.finance_template_id = form.financeTemplateId;
    } else {
      if (form.paymentTypeId) payload.payment_type_id = form.paymentTypeId;
      if (form.counterpartyId) payload.counterparty_id = form.counterpartyId;
      if (form.financeTemplateId) payload.finance_template_id = form.financeTemplateId;
    }
    try {
      let response;
      if (editingId) {
        response = await financeService.updateTransaction(editingId, payload);
      } else {
        const submission = resolveTransactionSubmission(createSubmissionRef.current, payload);
        createSubmissionRef.current = submission;
        response = await financeService.createTransaction(payload, submission.idempotencyKey);
      }
      const { data } = response;
      if (!data?.id) throw new Error("Backend не вернул сохранённую транзакцию.");
      createSubmissionRef.current = null;
      const [confirmed] = mapTransactions([data], paymentTypes, categories, counterparties);
      setRows((current) => editingId
        ? current.map((row) => row.id === editingId ? confirmed : row)
        : [confirmed, ...current.filter((row) => row.id !== confirmed.id)]);
      await loadData({ showLoader: false });
      setDrawerOpen(false);
    } catch (err) {
      setMutationError(err.response?.data?.detail || "Ошибка сохранения.");
    } finally {
      setSaving(false);
      mutationLocks.release("transaction-save");
    }
  };

  return (
    <div className="finance-page">
      <section className="finance-card">
        <header className="finance-header finance-header--transactions">
          <div className="report-actions finance-date-range"><ReportDateRangePicker value={dateRange} onChange={setDateRange} /></div>
          <div className="finance-summary-row"><article className="finance-summary-pill finance-income-pill"><span>Приход</span><strong>{error ? "Недоступно" : formatMoney(totals.income)}</strong></article><article className="finance-summary-pill finance-expense-pill"><span>Расход</span><strong>{error ? "Недоступно" : formatMoney(totals.expense)}</strong></article></div>
          <div className="finance-actions">
            <button type="button" className="finance-income-action" onClick={() => openCreate("income")}><span>+</span> ПРИХОД</button>
            <button type="button" className="finance-expense-action" onClick={() => openCreate("expense")}><span>-</span> РАСХОД</button>
            <button type="button" className="finance-excel-action" onClick={() => exportToExcel(rows, [{ key: "date", label: "Дата" }, { key: "amount", label: "Сумма" }, { key: "type", label: "Направление" }, { key: "paymentType", label: "Тип оплаты" }, { key: "counterparty", label: "Контрагент" }, { key: "category", label: "Категория" }, { key: "comment", label: "Комментарий" }], "finance-transactions")}>Скачать Excel</button>
            <label><span className="visually-hidden">Направление</span><select aria-label="Направление" value={direction} onChange={(event) => setDirection(event.target.value)}><option value="all">Все операции</option><option value="income">Приход</option><option value="expense">Расход</option></select></label>
          </div>
        </header>

        <div className="finance-table-wrapper">
          <table className="finance-table">
            <thead><tr><th>Дата</th><th>Сумма</th><th>Тип оплаты</th><th>Контрагент</th><th>Категория</th><th>Комментарий</th><th>Действия</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 24 }}>Загрузка...</td></tr> : error ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 24 }}><div className="login-error" role="alert">{error}</div></td></tr> : rows.map((row) => <tr key={row.id}><td>{formatDate(row.date)}</td><td className={row.type === "income" ? "finance-amount-income" : "finance-amount-expense"}>{row.type === "income" ? "+" : "-"} {formatMoney(row.amount)}</td><td>{row.paymentType}</td><td>{row.counterparty}</td><td>{row.category}</td><td>{row.comment}</td><td><button type="button" className="finance-action-edit" aria-label={`Редактировать транзакцию ${row.id}`} onClick={() => openEdit(row)}><Icon name="bi-pencil" size={15} /></button></td></tr>)}
              {!loading && !error && !rows.length ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 24 }}>Транзакций нет.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {drawerOpen ? <FinanceTransactionDrawer form={form} setForm={setForm} onClose={() => { if (!saving) { createSubmissionRef.current = null; setDrawerOpen(false); } }} onSave={save} editing={Boolean(editingId)} paymentTypes={paymentTypes} counterparties={counterparties} categories={categories} saving={saving} error={mutationError} /> : null}
    </div>
  );
}
