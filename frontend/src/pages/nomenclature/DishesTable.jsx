// Таблица каталога блюд OWNER с учётом видимых колонок.
// Разметка перенесена из NomenclaturePage.jsx (FE-07B) без изменений.
// Быстрые правки строк по-прежнему заблокированы (backend mutation contract
// не подключён) — updateRow только показывает предупреждение.
import Icon from "../../components/Icon";

function renderToggle(value, onClick) {
  if (value === null) return <span className="dish-toggle-empty">-</span>;
  return (
    <button type="button" className={`dish-toggle ${value ? "is-on" : ""}`} onClick={onClick} aria-pressed={value}>
      <span />
    </button>
  );
}

export default function DishesTable({
  filteredRows,
  isColumnVisible,
  tableMinWidth,
  updateRow,
  openDrawer,
  archiveDish,
  openPhotoPicker,
  saving,
  pendingDeleteId,
}) {
  return (
    <div className="dish-grid-wrap">
      <table className="dish-grid-table" style={{ "--dish-grid-min-width": `${tableMinWidth}px` }}>
        <thead>
          <tr>
            {isColumnVisible("photo") ? <th className="dish-col-photo">Фото</th> : null}
            {isColumnVisible("name") ? <th className="dish-col-name">Название</th> : null}
            {isColumnVisible("type") ? <th className="dish-col-type">Тип</th> : null}
            {isColumnVisible("unit") ? <th className="dish-col-unit">Ед. изм</th> : null}
            {isColumnVisible("cost") ? <th className="dish-col-cost">Себестоимость</th> : null}
            {isColumnVisible("price") ? <th className="dish-col-price">Цена</th> : null}
            {isColumnVisible("menu") ? <th className="dish-col-menu">Меню</th> : null}
            {isColumnVisible("subcategory") ? <th className="dish-col-subcategory">Подкатегория</th> : null}
            {isColumnVisible("printer") ? <th className="dish-col-printer">Принтер</th> : null}
            {isColumnVisible("recipe") ? <th className="dish-col-recipe">Рецепты</th> : null}
            {isColumnVisible("stock") ? <th className="dish-col-stock">Остаток</th> : null}
            {isColumnVisible("auto") ? <th className="dish-col-auto">Авто</th> : null}
            {isColumnVisible("set") ? <th className="dish-col-set">Сет</th> : null}
            {isColumnVisible("sort") ? <th className="dish-col-sort">Сорт</th> : null}
            {isColumnVisible("actions") ? <th className="dish-col-actions">Действия</th> : null}
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((row) => (
            <tr key={row.id}>
              {isColumnVisible("photo") ? (
              <td className="dish-col-photo">
                <button type="button" className="dish-photo-button" onClick={() => openPhotoPicker(row)} aria-label={`Выбрать фото для ${row.name}`}>
                  {row.photo ? (
                    <img className="dish-photo" src={row.photo} alt={row.name} />
                  ) : (
                    <span className="dish-photo-placeholder"><Icon name="bi-image" /></span>
                  )}
                </button>
              </td>
              ) : null}
              {isColumnVisible("name") ? <td className="dish-col-name"><button type="button" className="dish-name-link">{row.name}</button></td> : null}
              {isColumnVisible("type") ? <td className="dish-col-type"><span className={`dish-type-pill ${row.type === "Реализация" ? "realization" : ""}`}>{row.type}</span></td> : null}
              {isColumnVisible("unit") ? <td className="dish-col-unit">{row.unit}</td> : null}
              {isColumnVisible("cost") ? <td className="dish-col-cost">{row.cost}</td> : null}
              {isColumnVisible("price") ? (
              <td className="dish-col-price">
                <input className="dish-price-input" value={row.price} onChange={(event) => updateRow(row.id, "price", event.target.value)} />
              </td>
              ) : null}
              {isColumnVisible("menu") ? <td className="dish-col-menu"><span className="dish-menu-pill">{row.menu}</span></td> : null}
              {isColumnVisible("subcategory") ? <td className="dish-col-subcategory"><span className="dish-menu-pill">{row.subcategory || "-"}</span></td> : null}
              {isColumnVisible("printer") ? <td className="dish-col-printer dish-printer-cell">{row.printer || "-"}</td> : null}
              {isColumnVisible("recipe") ? <td className="dish-col-recipe"><button type="button" className="dish-recipe-link">{row.recipe}</button></td> : null}
              {isColumnVisible("stock") ? (
              <td className="dish-col-stock">
                <button type="button" className="dish-stock-box">
                  {row.stock}
                  {row.stock !== "-" && <Icon name="bi-arrow-repeat" size={13} />}
                </button>
              </td>
              ) : null}
              {isColumnVisible("auto") ? <td className="dish-col-auto">{renderToggle(row.auto, () => updateRow(row.id, "auto", !row.auto))}</td> : null}
              {isColumnVisible("set") ? <td className="dish-col-set">{renderToggle(row.set, () => updateRow(row.id, "set", !row.set))}</td> : null}
              {isColumnVisible("sort") ? <td className="dish-col-sort dish-sort-cell">{row.sort}</td> : null}
              {isColumnVisible("actions") ? (
              <td className="dish-col-actions">
                <div className="dish-row-actions">
                  <button type="button" disabled={saving || pendingDeleteId === row.id} onClick={() => openDrawer(row)} aria-label="Редактировать">
                    <Icon name="bi-pencil" size={15} />
                  </button>
                  <button type="button" className="danger" disabled={pendingDeleteId === row.id} onClick={() => archiveDish(row.id)} aria-label="Удалить">
                    <Icon name="bi-trash3" size={15} />
                  </button>
                </div>
              </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
