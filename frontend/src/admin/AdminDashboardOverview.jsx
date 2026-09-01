import { useEffect } from "react";

import Icon from '../components/Icon';

import { StatusBadge } from "./AdminShared";

import { TransactionsTable } from "./AdminDashboardTransactions";

export function AdminDashboardContainer({ isActive, onInnerBackChange, onNotify }) {

  useEffect(() => {
    if (!isActive) return undefined;
    onInnerBackChange(null);
    return () => onInnerBackChange(null);
  }, [isActive, onInnerBackChange]);

  if (!isActive) return null;

  return (
    <DashboardPage onNotify={onNotify} />
  );
}

export function DashboardPage({ onNotify }) {
  return (
    <>
      <section className="admin-dashboard-truth-shell" aria-labelledby="admin-dashboard-title">
        <span className="admin-dashboard-truth-shell__icon" aria-hidden="true">
          <Icon name="bi-grid-1x2-fill" size={26} />
        </span>
        <div className="admin-dashboard-truth-shell__content">
          <span className="admin-dashboard-truth-shell__eyebrow">MARJON HQ</span>
          <h1 id="admin-dashboard-title">Дашборд</h1>
          <p>
            Сводные показатели платформы появятся после подключения подтверждённого
            контракта показателей организаций. До этого раздел не показывает
            неподтверждённые числа или искусственную динамику.
          </p>
        </div>
        <div className="admin-dashboard-truth-shell__state">
          <Icon name="bi-shield-check" size={17} />
          <span>Только подтверждённые данные</span>
        </div>
      </section>
      <TransactionsTable onNotify={onNotify} />
    </>
  );
}

export function DetailModal({ data, onClose }) {
  useEffect(() => {
    function onKey(event) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!data) return null;
  const actions = data.actions && data.actions.length
    ? data.actions
    : [{ label: "Закрыть", variant: "ghost", onClick: onClose }];

  return (
    <div className="admin-modal" role="dialog" aria-modal="true" aria-label={data.title} onClick={onClose}>
      <div className="admin-modal__panel" onClick={(event) => event.stopPropagation()}>
        <div className="admin-modal__head">
          <div>
            <h3>{data.title}</h3>
            {data.subtitle ? <p>{data.subtitle}</p> : null}
          </div>
          {data.status ? <StatusBadge status={data.status} /> : null}
          <button className="admin-modal__close" type="button" onClick={onClose} aria-label="Закрыть">
            <Icon name="bi-x-lg" size={18} />
          </button>
        </div>
        <dl className="admin-modal__fields">
          {data.fields.map((field) => (
            <div key={field.label}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
        <div className="admin-modal__actions">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={`admin-modal__btn ${action.variant === "ghost" ? "is-ghost" : "is-primary"}`}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
