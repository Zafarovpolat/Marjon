// Секция статистики каталога блюд OWNER (кликабельные фильтры по показателям).
// Разметка перенесена из NomenclaturePage.jsx (FE-07B) без изменений.
import Icon from "../../components/Icon";

export default function DishesStatGrid({ computedStats, statFilter, setStatFilter }) {
  return (
    <div className="dish-stat-grid">
      {computedStats.map((stat) => (
        <article className={`dish-stat-card dish-stat-${stat.tone}`} key={stat.label}>
          <div className="dish-stat-top">
            <span>{stat.label}</span>
            <Icon name={stat.icon} size={20} />
          </div>
          <strong>{stat.value}</strong>
          <div className="dish-stat-lines">
            {stat.rows.map(([label, value], lineIndex) => {
              const filterKey = `${stat.tone}:${lineIndex}`;
              const active = statFilter === filterKey;
              return (
              <button
                type="button"
                className={active ? "is-active" : ""}
                key={label}
                onClick={() => setStatFilter((current) => (current === filterKey ? null : filterKey))}
                aria-pressed={active}
              >
                <em>{label}</em>
                <b>{value}</b>
              </button>
            )})}
          </div>
        </article>
      ))}
    </div>
  );
}
