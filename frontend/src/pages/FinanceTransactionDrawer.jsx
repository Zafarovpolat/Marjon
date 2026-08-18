import Icon from "../components/Icon";

function FinanceTransactionDrawer({
  form,
  setForm,
  onClose,
  onSave,
  editing = false,
  paymentTypes = [],
  counterparties = [],
  categories = [],
  saving = false,
  error = "",
}) {
  const isExpense = form.type === "expense";
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  return (
    <div className={`finance-drawer ${isExpense ? "is-expense" : "is-income"}`} role="dialog" aria-modal="true">
      <div className="finance-drawer__backdrop" onClick={saving ? undefined : onClose} />
      <form className="finance-form" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
        <header className="finance-form__header">
          <span className="finance-accent-bar" />
          <div><p>{isExpense ? "Расход" : "Приход"}</p><h2>{editing ? "Редактирование операции" : isExpense ? "Расходная операция" : "Приходная операция"}</h2></div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Закрыть"><Icon name="bi-x-lg" size={20} /></button>
        </header>

        <div className="finance-form__grid">
          <label><span>Тип операции</span><select value={form.type} disabled={saving} onChange={(event) => update("type", event.target.value)}><option value="income">Приход</option><option value="expense">Расход</option></select></label>
          <label><span>Сумма, UZS</span><input value={form.amount} disabled={saving} onChange={(event) => update("amount", event.target.value)} inputMode="decimal" /></label>
          <label><span>Тип оплаты{editing ? " — только чтение" : ""}</span><select value={form.paymentTypeId} disabled={editing || saving} onChange={(event) => update("paymentTypeId", event.target.value)}><option value="">Не выбран</option>{paymentTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>Контрагент{editing ? " — только чтение" : ""}</span><select value={form.counterpartyId} disabled={editing || saving} onChange={(event) => update("counterpartyId", event.target.value)}><option value="">Не выбран</option>{counterparties.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>
          <label><span>Категория</span><select value={form.categoryId} disabled={saving} onChange={(event) => update("categoryId", event.target.value)}><option value="">Не выбрана</option>{categories.filter((item) => !item.kind || item.kind === form.type).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="finance-form__wide"><span>Комментарий</span><textarea value={form.comment} disabled={saving} onChange={(event) => update("comment", event.target.value)} /></label>
        </div>

        {error ? <div className="login-error" role="alert">{error}</div> : null}
        <footer className="finance-form__footer"><button type="button" onClick={onClose} disabled={saving}>Отмена</button><button type="submit" disabled={saving}>{saving ? "Сохранение..." : "Сохранить"}</button></footer>
      </form>
    </div>
  );
}

export default FinanceTransactionDrawer;
