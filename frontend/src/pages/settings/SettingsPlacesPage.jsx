import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { settingsService } from "../../api/settings";
import Icon from "../../components/Icon";
import { isAbortError, useLatestRequest, useMutationLocks } from "../../hooks/useAsyncSafety";

// "Доп. цена" = additional-price model. Canonical Hall.pricing_type values
// (Marjon-backend-integration halls/schemas.py: percent|hourly|fixed|time_based).
// Only the two additional-price kinds are offered here; the service % is its
// own field, so pricing_type=percent is not surfaced as an "additional price".
const ADDITIONAL_PRICE_TYPES = [
  { value: "", label: "—" },
  { value: "fixed", label: "Дополнительная цена" },
  { value: "hourly", label: "Цена за час" },
];

function additionalPriceLabel(type) {
  return type === "hourly" ? "Цена за час" : "Дополнительная цена";
}

// Money display helpers (UZS = integer). RAW state is digit-only; the input
// shows a thousands-grouped view. Never let the grouped string reach the API.
function parseMoneyInput(value) {
  return String(value ?? "").replace(/\D/g, "");
}
function formatMoneyInput(raw) {
  const digits = parseMoneyInput(raw);
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// Exit-animation duration; kept in sync with the CSS `settings-modal-out`
// keyframe below. Reduced-motion closes immediately.
const MODAL_EXIT_MS = 160;
function prefersReducedMotion() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// `place` (Место) has NO canonical Hall field, so it is kept in form state for
// the approved layout but intentionally NOT persisted (Phase 5C backend gap).
// `price` (additional-price value) has no structured numeric column either; it
// round-trips only through the canonical free-text Hall.condition.
const EMPTY_HALL_FORM = { name: "", place: "", percent: "", pricing_type: "", price: "", is_active: true };
const EMPTY_TABLE_FORM = { number: "", capacity: "4", is_active: true };

function tablesLabel(count) {
  const n = Number(count) || 0;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} стол`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} стола`;
  return `${n} столов`;
}

function activeTables(hall) {
  return (Array.isArray(hall?.tables) ? hall.tables : []).filter((t) => t && t.is_active !== false);
}

function StatusBadge({ active }) {
  return (
    <span className={`settings-status-badge ${active ? "is-active" : "is-inactive"}`}>
      {active ? "Активен" : "Неактивен"}
    </span>
  );
}

// COMPONENT
export default function SettingsPlacesPage() {
  const [halls, setHalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [hallDrawer, setHallDrawer] = useState(null);
  const [hallForm, setHallForm] = useState(EMPTY_HALL_FORM);
  const [tableDrawer, setTableDrawer] = useState(null);
  const [tableForm, setTableForm] = useState(EMPTY_TABLE_FORM);
  const [saving, setSaving] = useState(false);
  const [drawerError, setDrawerError] = useState("");
  const [modalClosing, setModalClosing] = useState(false);
  const closingRef = useRef(false);
  const closeTimer = useRef(null);
  const beginRequest = useLatestRequest();
  const locks = useMutationLocks();

  // Single controlled close path shared by ×, Отмена, backdrop, Escape and a
  // successful submit: play the exit animation, then unmount after its exact
  // duration. Guarded against duplicate/stale timers so a reopen is never
  // killed by a pending close.
  function requestClose() {
    if (closingRef.current) return;
    closingRef.current = true;
    setModalClosing(true);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setHallDrawer(null);
      setTableDrawer(null);
      setModalClosing(false);
      closingRef.current = false;
    }, prefersReducedMotion() ? 0 : MODAL_EXIT_MS);
  }
  function resetCloseState() {
    clearTimeout(closeTimer.current);
    closingRef.current = false;
    setModalClosing(false);
  }
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const selectedHallId = searchParams.get("hall_id") || "";
  const selectedHall = useMemo(
    () => halls.find((h) => String(h.id) === String(selectedHallId)) || null,
    [halls, selectedHallId],
  );
  const inTablesView = Boolean(selectedHallId && selectedHall);

  function load() {
    const request = beginRequest();
    setLoading(true);
    setError("");
    settingsService.listPlaces({ signal: request.signal })
      .then(({ data }) => {
        if (!request.isCurrent()) return;
        setHalls(Array.isArray(data) ? data : data?.items || []);
      })
      .catch((err) => {
        if (!request.isCurrent() || isAbortError(err)) return;
        setHalls([]);
        setError(err.response?.data?.detail || "Не удалось загрузить места.");
      })
      .finally(() => { if (request.isCurrent()) setLoading(false); });
  }

  useEffect(() => { load(); }, [beginRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stale/invalid ?hall_id (e.g. after a hall is deactivated) → drop it and
  // fall back to the Places list rather than showing "Столы — undefined".
  useEffect(() => {
    if (!loading && selectedHallId && !halls.some((h) => String(h.id) === String(selectedHallId))) {
      backToList();
    }
  }, [loading, selectedHallId, halls]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape closes whichever centered modal is open (aria-modal dialog), unless
  // a save is in flight. Backdrop click / × already close via their handlers.
  useEffect(() => {
    if (!hallDrawer && !tableDrawer) return undefined;
    function onKey(event) {
      if (event.key !== "Escape" || saving) return;
      requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hallDrawer, tableDrawer, saving]); // eslint-disable-line react-hooks/exhaustive-deps

  function openHall(hall) {
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.set("hall_id", hall.id); return p; });
  }
  function backToList() {
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete("hall_id"); return p; });
  }

  // HANDLERS
  function openAddHall() { resetCloseState(); setHallForm(EMPTY_HALL_FORM); setDrawerError(""); setHallDrawer({ mode: "create" }); }
  function openEditHall(hall) {
    resetCloseState();
    setHallForm({
      name: hall.name || "",
      place: "", // no canonical field — not restored (Phase 5C gap)
      percent: hall.percent == null ? "" : String(hall.percent),
      pricing_type: hall.pricing_type === "hourly" || hall.pricing_type === "fixed" ? hall.pricing_type : "",
      price: parseMoneyInput(hall.condition || ""), // RAW digits; displayed grouped
      is_active: hall.is_active !== false,
    });
    setDrawerError("");
    setHallDrawer({ mode: "edit", id: hall.id });
  }
  function hallPayload() {
    const name = hallForm.name.trim();
    if (!name) return null;
    const raw = String(hallForm.percent).trim().replace(",", ".");
    let percent = null;
    if (raw !== "") {
      if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
      percent = Number(raw);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
    }
    const pricing_type = hallForm.pricing_type || null;
    // Additional-price value persists only via the canonical free-text
    // Hall.condition (no structured numeric column — Phase 5C gap). `place`
    // (Место) is intentionally omitted: no canonical Hall field exists for it.
    const condition = pricing_type ? (String(hallForm.price).trim() || null) : null;
    const base = { name, percent, pricing_type, condition };
    return hallDrawer?.mode === "edit" ? { ...base, is_active: hallForm.is_active } : base;
  }
  async function saveHall(event) {
    event.preventDefault();
    if (!locks.acquire("hall-save")) return;
    const payload = hallPayload();
    if (!payload) { setDrawerError("Укажите название места и корректный процент (0–100)."); locks.release("hall-save"); return; }
    setSaving(true); setDrawerError("");
    try {
      if (hallDrawer.mode === "edit") await settingsService.updatePlace(hallDrawer.id, payload);
      else await settingsService.createPlace(payload);
      requestClose();
      load();
    } catch (err) { setDrawerError(err.response?.data?.detail || "Не удалось сохранить место."); }
    finally { setSaving(false); locks.release("hall-save"); }
  }
  async function deactivateHall(hall) {
    if (!locks.acquire(`hall-del:${hall.id}`)) return;
    try { await settingsService.deactivatePlace(hall.id); load(); }
    catch (err) { setError(err.response?.data?.detail || "Не удалось деактивировать место."); }
    finally { locks.release(`hall-del:${hall.id}`); }
  }

  // TABLE_HANDLERS
  function openAddTable() { resetCloseState(); setTableForm(EMPTY_TABLE_FORM); setDrawerError(""); setTableDrawer({ mode: "create" }); }
  function openEditTable(table) {
    resetCloseState();
    setTableForm({
      number: String(table.number ?? ""),
      capacity: String(table.capacity ?? "4"),
      is_active: table.is_active !== false,
    });
    setDrawerError("");
    setTableDrawer({ mode: "edit", tableId: table.id });
  }
  function tablePayload() {
    const number = Number(String(tableForm.number).trim());
    const capacity = Number(String(tableForm.capacity).trim());
    if (!Number.isInteger(number) || number <= 0) return null;
    if (!Number.isInteger(capacity) || capacity <= 0) return null;
    const base = { number, capacity };
    return tableDrawer?.mode === "edit" ? { ...base, is_active: tableForm.is_active } : base;
  }
  const duplicateTableHint = useMemo(() => {
    if (!tableDrawer || !selectedHall) return false;
    const n = Number(String(tableForm.number).trim());
    if (!Number.isInteger(n)) return false;
    return activeTables(selectedHall).some((t) => t.number === n && t.id !== tableDrawer.tableId);
  }, [tableDrawer, tableForm.number, selectedHall]);
  async function saveTable(event) {
    event.preventDefault();
    if (!selectedHall || !locks.acquire("table-save")) return;
    const payload = tablePayload();
    if (!payload) { setDrawerError("Укажите номер и вместимость (целые > 0)."); locks.release("table-save"); return; }
    setSaving(true); setDrawerError("");
    try {
      if (tableDrawer.mode === "edit") await settingsService.updatePlaceTable(selectedHall.id, tableDrawer.tableId, payload);
      else await settingsService.createPlaceTable(selectedHall.id, payload);
      requestClose();
      load();
    } catch (err) { setDrawerError(err.response?.data?.detail || "Не удалось сохранить стол."); }
    finally { setSaving(false); locks.release("table-save"); }
  }
  async function deactivateTable(table) {
    if (!selectedHall || !locks.acquire(`table-del:${table.id}`)) return;
    try { await settingsService.deactivatePlaceTable(selectedHall.id, table.id); load(); }
    catch (err) { setError(err.response?.data?.detail || "Не удалось деактивировать стол."); }
    finally { locks.release(`table-del:${table.id}`); }
  }

  // RENDER
  function renderPlaces() {
    return (
      <>
        <header className="settings-header">
          <div className="settings-title-group">
            <span className="settings-accent-bar" />
            <div>
              <p>Настройки</p>
              <h1>Места</h1>
              <span className="settings-places-subtitle">Управление залами и столами</span>
            </div>
          </div>
          <div className="settings-actions">
            <button type="button" onClick={openAddHall}>Добавить место</button>
          </div>
        </header>
        {loading ? (
          <div className="settings-empty-state" role="status">Загрузка...</div>
        ) : error ? (
          <div className="settings-empty-state" role="alert">{error} <button type="button" className="settings-places-retry" onClick={load}>Повторить</button></div>
        ) : !halls.length ? (
          <div className="settings-empty-state settings-places-empty" role="status">
            <span className="settings-places-empty__icon"><Icon name="bi-geo-alt" size={26} /></span>
            <strong>Мест пока нет</strong>
            <span>Добавьте первое место, чтобы настроить зал и столы.</span>
          </div>
        ) : (
          <div className="settings-places-list">
            {halls.map((hall) => (
              <article className="settings-place" key={hall.id}>
                <button type="button" className="settings-place__main" onClick={() => openHall(hall)} aria-label={`Открыть столы: ${hall.name}`}>
                  <span className="settings-place__icon"><Icon name="bi-geo-alt" size={18} /></span>
                  <span className="settings-place__info">
                    <span className="settings-place__name">{hall.name}</span>
                    <span className="settings-place__count">{tablesLabel(activeTables(hall).length)}</span>
                  </span>
                </button>
                <div className="settings-place__meta">
                  <StatusBadge active={hall.is_active !== false} />
                  <button type="button" className="settings-place__edit" onClick={() => openEditHall(hall)}>Редактировать</button>
                  <button type="button" className="settings-action-delete" onClick={() => deactivateHall(hall)} aria-label="Деактивировать место"><Icon name="bi-x-octagon" size={15} /></button>
                  <span className="settings-place__chevron" aria-hidden="true"><Icon name="bi-chevron-right" size={18} /></span>
                </div>
              </article>
            ))}
          </div>
        )}
      </>
    );
  }

  // RENDER2
  function renderTablesView() {
    const tables = activeTables(selectedHall);
    return (
      <>
        <div className="settings-places-breadcrumb">
          <button type="button" className="settings-back" onClick={backToList}><Icon name="bi-chevron-left" size={16} /> Места</button>
        </div>
        <header className="settings-header">
          <div className="settings-title-group">
            <span className="settings-accent-bar" />
            <div>
              <p>Столы — {selectedHall.name}</p>
              <h1>{selectedHall.name}</h1>
              <span className="settings-places-subtitle">Управление столами выбранного места</span>
            </div>
          </div>
          <div className="settings-actions">
            <button type="button" onClick={openAddTable}>Добавить стол</button>
          </div>
        </header>
        {tables.length ? (
          <div className="settings-tbl">
            <div className="settings-tbl__row settings-tbl__head" aria-hidden="true">
              <span>№ стола</span><span>Вместимость</span><span>Статус</span><span>Действия</span>
            </div>
            {tables.map((t) => (
              <div className="settings-tbl__row" key={t.id}>
                <div className="settings-tbl__cell"><span className="settings-tbl__label">Стол</span><strong>№{t.number}</strong></div>
                <div className="settings-tbl__cell"><span className="settings-tbl__label">Вместимость</span>{t.capacity}</div>
                <div className="settings-tbl__cell"><StatusBadge active={t.is_active !== false} /></div>
                <div className="settings-tbl__cell settings-tbl__act">
                  <button type="button" className="settings-place__edit" onClick={() => openEditTable(t)}>Редактировать</button>
                  <button type="button" className="settings-action-delete" onClick={() => deactivateTable(t)} aria-label="Деактивировать стол"><Icon name="bi-x-octagon" size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="settings-empty-state settings-places-empty" role="status">
            <span className="settings-places-empty__icon"><Icon name="bi-grid-3x3-gap" size={24} /></span>
            <strong>Столов пока нет</strong>
            <span>Добавьте первый стол для этого места.</span>
            <button type="button" onClick={openAddTable}>Добавить стол</button>
          </div>
        )}
      </>
    );
  }

  // RENDER3
  return (
    <div className="settings-page settings-places-page settings-owner-view">
      <section className="settings-card">
        {inTablesView ? renderTablesView() : renderPlaces()}
      </section>

      {hallDrawer ? createPortal((
        <div className="settings-owner-view settings-drawer-layer">
          <div className={`settings-drawer settings-modal-overlay${modalClosing ? " is-closing" : ""}`} role="presentation">
          <div className="settings-drawer__backdrop" onClick={saving ? undefined : requestClose} />
          <form className="settings-form settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-hall-modal-title" onSubmit={saveHall}>
            <header className="settings-form__header">
              <span className="settings-accent-bar" />
              <div><p>{hallDrawer.mode === "edit" ? "Редактировать" : "Добавить"}</p><h2 id="settings-hall-modal-title">{hallDrawer.mode === "edit" ? "Редактировать место" : "Добавить место"}</h2></div>
              <button type="button" disabled={saving} onClick={requestClose} aria-label="Закрыть"><Icon name="bi-x-lg" size={20} /></button>
            </header>
            <div className="settings-form__body">
              <label className="settings-form__wide"><span>Название *</span><input autoFocus value={hallForm.name} placeholder="Введите название" onChange={(e) => setHallForm((f) => ({ ...f, name: e.target.value }))} /></label>
              <label className="settings-form__wide"><span>Место</span><input value={hallForm.place} placeholder="Введите место" onChange={(e) => setHallForm((f) => ({ ...f, place: e.target.value }))} /><small className="settings-form__note">Сохранение будет подключено на следующем этапе</small></label>
              <label className="settings-form__wide"><span>% обслуживания в заведении</span><input value={hallForm.percent} inputMode="decimal" placeholder="Введите % обслуживания" onChange={(e) => setHallForm((f) => ({ ...f, percent: e.target.value }))} /></label>
              <label className="settings-form__wide"><span>Доп. цена</span>
                <select value={hallForm.pricing_type} onChange={(e) => setHallForm((f) => ({ ...f, pricing_type: e.target.value }))}>
                  {ADDITIONAL_PRICE_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              {hallForm.pricing_type ? (
                <label className="settings-form__wide settings-form__conditional"><span>{additionalPriceLabel(hallForm.pricing_type)} *</span><input value={formatMoneyInput(hallForm.price)} inputMode="numeric" placeholder="Введите цену" onChange={(e) => setHallForm((f) => ({ ...f, price: parseMoneyInput(e.target.value) }))} /></label>
              ) : null}
              <div className="settings-toggle-field settings-form__wide">
                <span>Статус</span>
                <label className="settings-switch">
                  <input type="checkbox" checked={hallForm.is_active} disabled={hallDrawer.mode !== "edit"} onChange={(e) => setHallForm((f) => ({ ...f, is_active: e.target.checked }))} />
                  <span className="settings-switch__track" aria-hidden="true"><span className="settings-switch__thumb" /></span>
                  <span className="settings-switch__label">{hallForm.is_active ? "Активен" : "Неактивен"}</span>
                </label>
              </div>
            </div>
            {drawerError ? <p className="settings-form__error" role="alert">{drawerError}</p> : null}
            <footer className="settings-form__footer">
              <button type="button" disabled={saving} onClick={requestClose}>Отмена</button>
              <button type="submit" disabled={saving}>{saving ? "Сохранение..." : hallDrawer.mode === "edit" ? "Сохранить" : "Добавить"}</button>
            </footer>
          </form>
          </div>
        </div>
      ), document.body) : null}

      {/* TABLE_DRAWER */}
      {tableDrawer && selectedHall ? createPortal((
        <div className="settings-owner-view settings-drawer-layer">
          <div className={`settings-drawer settings-modal-overlay${modalClosing ? " is-closing" : ""}`} role="presentation">
          <div className="settings-drawer__backdrop" onClick={saving ? undefined : requestClose} />
          <form className="settings-form settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-table-modal-title" onSubmit={saveTable}>
            <header className="settings-form__header">
              <span className="settings-accent-bar" />
              <div><p>{tableDrawer.mode === "edit" ? "Редактировать" : "Добавить"}</p><h2 id="settings-table-modal-title">{tableDrawer.mode === "edit" ? "Редактировать стол" : "Добавить стол"}</h2></div>
              <button type="button" disabled={saving} onClick={requestClose} aria-label="Закрыть"><Icon name="bi-x-lg" size={20} /></button>
            </header>
            <div className="settings-form__body">
              <p className="settings-form__context">Место: <strong>{selectedHall.name}</strong></p>
              <label className="settings-form__wide"><span>Номер стола *</span><input autoFocus value={tableForm.number} inputMode="numeric" placeholder="Напр. 5" onChange={(e) => setTableForm((f) => ({ ...f, number: e.target.value }))} /></label>
              <label className="settings-form__wide"><span>Вместимость</span><input value={tableForm.capacity} inputMode="numeric" onChange={(e) => setTableForm((f) => ({ ...f, capacity: e.target.value }))} /></label>
              {tableDrawer.mode === "edit" ? (
                <div className="settings-toggle-field settings-form__wide">
                  <span>Статус</span>
                  <label className="settings-switch">
                    <input type="checkbox" checked={tableForm.is_active} onChange={(e) => setTableForm((f) => ({ ...f, is_active: e.target.checked }))} />
                    <span className="settings-switch__track" aria-hidden="true"><span className="settings-switch__thumb" /></span>
                    <span className="settings-switch__label">{tableForm.is_active ? "Активен" : "Неактивен"}</span>
                  </label>
                </div>
              ) : null}
            </div>
            {duplicateTableHint ? <p className="settings-form__hint" role="status">Стол с таким номером уже есть в этом месте.</p> : null}
            {drawerError ? <p className="settings-form__error" role="alert">{drawerError}</p> : null}
            <footer className="settings-form__footer">
              <button type="button" disabled={saving} onClick={requestClose}>Отмена</button>
              <button type="submit" disabled={saving}>{saving ? "Сохранение..." : tableDrawer.mode === "edit" ? "Сохранить" : "Добавить"}</button>
            </footer>
          </form>
          </div>
        </div>
      ), document.body) : null}
    </div>
  );
}
