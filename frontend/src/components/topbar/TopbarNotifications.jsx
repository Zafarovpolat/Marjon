import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import { InlineLoader } from "../Loader";

// Складские уведомления Topbar (низкие остатки).
// Вынесено из Topbar.jsx (FE-07B). Inventory Core остаётся DEFERRED —
// loadLowStock намеренно возвращает пустой список и явное сообщение,
// складская бизнес-логика НЕ восстанавливается.
export default function TopbarNotifications() {
  const notificationsRef = useRef(null);
  const [stockOpen, setStockOpen] = useState(false);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState("");
  const [lowStock, setLowStock] = useState([]);
  const [ingredients, setIngredients] = useState([]);

  const ingredientById = useMemo(() => new Map(ingredients.map((item) => [item.id, item])), [ingredients]);
  const visibleLowStock = useMemo(
    () => lowStock.filter((item) => Number(item.quantity || 0) <= Number(item.min_quantity || 0)).slice(0, 8),
    [lowStock],
  );
  const stockNotifications = useMemo(() => {
    if (visibleLowStock.length) {
      return visibleLowStock.map((item) => {
        const ingredient = ingredientById.get(item.ingredient_id);
        const quantity = Number(item.quantity || 0);
        const minQuantity = Number(item.min_quantity || 0);
        return {
          id: item.id,
          title: ingredient?.name || `${"Ингредиент"} ${String(item.ingredient_id).slice(0, 8)}`,
          text: `${quantity.toLocaleString("ru-RU")} ${item.unit} / min ${minQuantity.toLocaleString("ru-RU")} ${item.unit}`,
        };
      });
    }

    return [];
  }, [ingredientById, visibleLowStock]);
  const notificationCount = stockError ? 0 : stockNotifications.length;
  const notificationLabel = notificationCount
    ? `Уведомления: ${notificationCount}`
    : "Уведомлений нет";

  function loadLowStock() {
    setStockLoading(false);
    setLowStock([]);
    setIngredients([]);
    setStockError("Остатки недоступны до завершения Inventory Core.");
  }

  function toggleStockNotifications() {
    setStockOpen((current) => {
      const next = !current;
      if (next && !lowStock.length && !stockLoading) {
        loadLowStock();
      }
      return next;
    });
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (!notificationsRef.current?.contains(event.target)) {
        setStockOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    loadLowStock();
  }, []);

  return (
    <div className="topbar-notification-wrap" ref={notificationsRef}>
      <button
        className={`topbar-icon topbar-notification ${stockOpen ? "is-open" : ""}`}
        type="button"
        aria-label={notificationLabel}
        aria-haspopup="dialog"
        aria-expanded={stockOpen}
        onClick={toggleStockNotifications}
      >
        <Icon name="bi-bell" size={18} />
        {notificationCount ? (
          <span className="topbar-notification__badge" aria-hidden="true">
            {notificationCount > 99 ? "99+" : notificationCount}
          </span>
        ) : null}
      </button>
      {stockOpen ? (
        <div className="stock-alert-popover" role="dialog" aria-label={"Складские уведомления"}>
          <div className="stock-alert-popover__head">
            <div>
              <span>{"Уведомления"}</span>
              <strong>{notificationCount ? `${notificationCount} ${notificationCount === 1 ? "сообщение" : "сообщений"}` : "Нет сообщений"}</strong>
            </div>
            <button className={stockLoading ? "is-loading" : ""} type="button" onClick={loadLowStock} disabled={stockLoading} aria-label={"Обновить"}>
              <Icon name="bi-arrow-clockwise" size={16} />
            </button>
          </div>
          <div className="stock-alert-popover__body">
            {stockLoading ? <div className="stock-alert-popover__empty"><InlineLoader text="Загрузка..." /></div> : null}
            {stockError ? <p className="stock-alert-popover__error">{stockError}</p> : null}
            {!stockLoading && !stockError ? stockNotifications.map((item) => {
              return (
                <div className="stock-alert-item" key={item.id}>
                  <div className="stock-alert-item__icon"><Icon name="bi-exclamation-triangle" size={16} /></div>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.text}</span>
                  </div>
                </div>
              );
            }) : null}
            {!stockLoading && !stockError && !stockNotifications.length ? (
              <p className="stock-alert-popover__empty">{"Новых сообщений нет"}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
