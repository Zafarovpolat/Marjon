import { useState } from "react";
import DataTableView from "../components/DataTableView";
import { getReportTable } from "../data/reportDemo";

export default function SectionPage({ eyebrow, title, description, items = [], sectionKey }) {
  const [activeTile, setActiveTile] = useState(null);

  const tableFor = (item) => getReportTable(sectionKey, item?.tableKey);

  if (activeTile) {
    const table = tableFor(activeTile);
    return (
      <section className="card card-pad section-window">
        <div className="section-header">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{activeTile.title}</h2>
            {activeTile.text ? <p className="section-window__description">{activeTile.text}</p> : null}
          </div>
          <button type="button" className="dashboard-back-button" onClick={() => setActiveTile(null)}>
            <i className="bi bi-arrow-left" aria-hidden="true" />
            <span>Назад</span>
          </button>
        </div>
        <DataTableView columns={table?.columns} rows={table?.rows} />
      </section>
    );
  }

  return (
    <section className="card card-pad section-window">
      <div className="section-header">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          {description ? <p className="section-window__description">{description}</p> : null}
        </div>
      </div>

      <div className="section-window__grid">
        {items.map((item) => {
          const clickable = Boolean(tableFor(item));
          return (
            <article
              className={`section-window__tile ${clickable ? "is-clickable" : ""}`}
              key={item.title}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? () => setActiveTile(item) : undefined}
              onKeyDown={
                clickable
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setActiveTile(item);
                      }
                    }
                  : undefined
              }
            >
              <div className="section-window__icon"><i className={`bi ${item.icon || "bi-grid"}`} /></div>
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
