// Таблица каталога блюд OWNER с учётом видимых колонок.
// V21: колонки Тип/Меню/Подкатегория/Рецепты убраны из презентации (backend
// поля и API-ответ не тронуты); фото открывается нативным OS-пикером и грузится
// напрямую POST /inventory/products/{id}/photo. Быстрые правки строк
// по-прежнему заблокированы (backend mutation contract не подключён) —
// updateRow только показывает предупреждение.
import { useRef } from "react";
import Icon from "../../components/Icon";
import ReportEmptyState from "../../components/ReportEmptyState";
import { SUPPORTED_DISH_PHOTO_TYPES } from "./useDishesCatalog";

function renderToggle(value, onClick) {
  if (value === null) return <span className="dish-toggle-empty">-</span>;
  return (
    <button type="button" className={`dish-toggle ${value ? "is-on" : ""}`} onClick={onClick} aria-pressed={value}>
      <span />
    </button>
  );
}

// V22 — Остаток: честный компактный бейдж реального backend-значения
// (stock: число = mint, "0" = red/neutral, "-" = пусто). Кнопки нет:
// быстрого изменения остатка backend не поддерживает (не fake affordance).
function StockBadge({ value }) {
  if (value === "-") return <span className="dish-stock-badge is-empty">-</span>;
  const amount = Number(String(value).replace(/\s/g, ""));
  return (
    <span className={`dish-stock-badge ${amount > 0 ? "is-positive" : "is-zero"}`}>{value}</span>
  );
}

// V21 — нативный OS-пикер фото прямо из строки: клик → скрытый input[type=file]
// → выбранный файл уходит в uploadDishPhoto (тот же id, без дубля блюда).
function DishPhotoCell({ row, uploading, onPick }) {
  const inputRef = useRef(null);
  return (
    <td className="dish-col-photo">
      <button
        type="button"
        className="dish-photo-button"
        disabled={uploading}
        aria-busy={uploading || undefined}
        onClick={() => inputRef.current?.click()}
        aria-label={`Выбрать фото для ${row.name}`}
      >
        {row.photo ? (
          <img className="dish-photo" src={row.photo} alt={row.name} />
        ) : (
          <span className="dish-photo-placeholder"><Icon name="bi-image" /></span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={SUPPORTED_DISH_PHOTO_TYPES.join(",")}
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          onPick(row.id, event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </td>
  );
}

export default function DishesTable({
  filteredRows,
  isColumnVisible,
  tableMinWidth,
  updateRow,
  openDrawer,
  archiveDish,
  uploadDishPhoto,
  photoUploadingId,
  saving,
  pendingDeleteId,
}) {
  const isEmpty = !filteredRows.length;
  return (
    <div className={`settings-table-wrapper dish-grid-wrap${isEmpty ? " is-empty" : ""}`}>
      <div className="dish-grid-scroll">
        <table className="settings-table dish-grid-table" aria-label="Блюда" style={{ "--dish-grid-min-width": `${tableMinWidth}px` }}>
        <thead>
          <tr>
            {isColumnVisible("photo") ? <th className="dish-col-photo">Фото</th> : null}
            {isColumnVisible("name") ? <th className="dish-col-name">Название</th> : null}
            {isColumnVisible("unit") ? <th className="dish-col-unit">Ед. изм</th> : null}
            {isColumnVisible("cost") ? <th className="dish-col-cost">Себестоимость</th> : null}
            {isColumnVisible("price") ? <th className="dish-col-price">Цена</th> : null}
            {isColumnVisible("printer") ? <th className="dish-col-printer">Принтер</th> : null}
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
                <DishPhotoCell row={row} uploading={photoUploadingId === row.id} onPick={uploadDishPhoto} />
              ) : null}
              {isColumnVisible("name") ? <td className="dish-col-name"><span className="dish-name-text" title={row.name}>{row.name}</span></td> : null}
              {isColumnVisible("unit") ? <td className="dish-col-unit">{row.unit}</td> : null}
              {isColumnVisible("cost") ? <td className="dish-col-cost dish-money-cell">{row.cost}</td> : null}
              {isColumnVisible("price") ? <td className="dish-col-price dish-money-cell"><span className="dish-price-text">{row.price}</span></td> : null}
              {isColumnVisible("printer") ? <td className="dish-col-printer dish-printer-cell">{row.printer || "-"}</td> : null}
              {isColumnVisible("stock") ? (
              <td className="dish-col-stock">
                <StockBadge value={row.stock} />
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
      {isEmpty ? (
        <div className="dish-empty-overlay">
          <ReportEmptyState title="Блюда не найдены" />
        </div>
      ) : null}
    </div>
  );
}
