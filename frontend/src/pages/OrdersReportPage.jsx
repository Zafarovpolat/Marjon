import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import DemoNotice from "../components/DemoNotice";
import Icon from "../components/Icon";
import ReportDateRangePicker from "../components/ReportDateRangePicker";

const initialFilters = {
  orderType: "all",
  status: "all",
  waiter: "all",
  place: "",
  client: "",
  courier: "",
  minAmount: "",
  maxAmount: "",
};

const orderRows = [
  {
    id: "40969868",
    orderNumber: "2",
    date: "22.06.2026 / 20:51",
    type: "На стол",
    place: "ЗАЛЛ, 6-стол",
    waiter: "САБИНА",
    client: "-",
    courier: "не указан",
    goodsPrice: "30 000 UZS",
    goodsValue: 30000,
    placePrice: "0 UZS",
    discount: "0 UZS",
    deliveryPrice: "0 UZS",
    servicePrice: "3 000 UZS",
    serviceValue: 3000,
    totalPrice: "33 000 UZS",
    totalValue: 33000,
    status: "Завершено",
    dishes: ["КФС x1"],
  },
  {
    id: "40956071",
    orderNumber: "1",
    date: "22.06.2026 / 19:36",
    type: "На стол",
    place: "ЗАЛЛ, 4-стол",
    waiter: "САБИНА",
    client: "-",
    courier: "не указан",
    goodsPrice: "66 000 UZS",
    goodsValue: 66000,
    placePrice: "0 UZS",
    discount: "0 UZS",
    deliveryPrice: "0 UZS",
    servicePrice: "6 600 UZS",
    serviceValue: 6600,
    totalPrice: "72 600 UZS",
    totalValue: 72600,
    status: "Завершено",
    dishes: ["Кайнатма шурва x2"],
  },
  {
    id: "40750410",
    orderNumber: "4",
    date: "21.06.2026 / 04:04",
    type: "На стол",
    place: "Billiard, 8-стол",
    waiter: "САБИНА",
    client: "-",
    courier: "не указан",
    goodsPrice: "27 000 UZS",
    goodsValue: 27000,
    placePrice: "0 UZS",
    discount: "0 UZS",
    deliveryPrice: "0 UZS",
    servicePrice: "0 UZS",
    serviceValue: 0,
    totalPrice: "27 000 UZS",
    totalValue: 27000,
    status: "Завершено",
    dishes: ["Мампар x1"],
  },
  {
    id: "40750408",
    orderNumber: "3",
    date: "21.06.2026 / 04:03",
    type: "На стол",
    place: "КАБИНА, 2-стол",
    waiter: "САБИНА",
    client: "-",
    courier: "не указан",
    goodsPrice: "0 UZS",
    goodsValue: 0,
    placePrice: "0 UZS",
    discount: "0 UZS",
    deliveryPrice: "0 UZS",
    servicePrice: "0 UZS",
    serviceValue: 0,
    totalPrice: "0 UZS",
    totalValue: 0,
    status: "Завершено",
    dishes: ["Без блюд"],
  },
  {
    id: "40056934",
    orderNumber: "2",
    date: "15.06.2026 / 20:39",
    type: "Доставка",
    place: "-",
    waiter: "SARDORKASSA",
    client: "-",
    courier: "не указан",
    goodsPrice: "40 000 UZS",
    goodsValue: 40000,
    placePrice: "0 UZS",
    discount: "0 UZS",
    deliveryPrice: "0 UZS",
    servicePrice: "0 UZS",
    serviceValue: 0,
    totalPrice: "40 000 UZS",
    totalValue: 40000,
    status: "Завершено",
    dishes: ["Ассорти шурва x1"],
  },
  {
    id: "40056830",
    orderNumber: "1",
    date: "15.06.2026 / 20:39",
    type: "Доставка",
    place: "-",
    waiter: "SARDORKASSA",
    client: "-",
    courier: "не указан",
    goodsPrice: "84 000 UZS",
    goodsValue: 84000,
    placePrice: "0 UZS",
    discount: "0 UZS",
    deliveryPrice: "0 UZS",
    servicePrice: "0 UZS",
    serviceValue: 0,
    totalPrice: "84 000 UZS",
    totalValue: 84000,
    status: "Завершено",
    dishes: ["Лагмон x2", "Чучвара x1"],
  },
];

export default function OrdersReportPage() {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ preset: "", start: "01.06.2026", end: "01.07.2026" });
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [rows, setRows] = useState(orderRows);
  const [isDemo, setIsDemo] = useState(true);

  useEffect(() => {
    api.get("/reports/orders", { params: { start: dateRange.start, end: dateRange.end } })
      .then(({ data }) => {
        const items = Array.isArray(data) ? data : data?.items || data?.orders || [];
        if (items.length) {
          setRows(items.map((item) => ({
            id: String(item.id || ""),
            orderNumber: String(item.order_number || item.orderNumber || ""),
            date: item.date || item.created_at || "",
            type: item.order_type || item.type || "На стол",
            place: item.place || item.table_name || "-",
            waiter: item.waiter_name || item.waiter || "-",
            client: item.client_name || item.client || "-",
            courier: item.courier_name || item.courier || "не указан",
            goodsPrice: item.goods_price ? `${Number(item.goods_price).toLocaleString("ru-RU")} UZS` : "0 UZS",
            goodsValue: Number(item.goods_price || 0),
            placePrice: item.place_price ? `${Number(item.place_price).toLocaleString("ru-RU")} UZS` : "0 UZS",
            discount: item.discount ? `${Number(item.discount).toLocaleString("ru-RU")} UZS` : "0 UZS",
            deliveryPrice: item.delivery_price ? `${Number(item.delivery_price).toLocaleString("ru-RU")} UZS` : "0 UZS",
            servicePrice: item.service_price ? `${Number(item.service_price).toLocaleString("ru-RU")} UZS` : "0 UZS",
            serviceValue: Number(item.service_price || 0),
            totalPrice: item.total_price ? `${Number(item.total_price).toLocaleString("ru-RU")} UZS` : "0 UZS",
            totalValue: Number(item.total_price || 0),
            status: item.status_label || item.status || "Завершено",
            dishes: item.dishes || item.order_items?.map((d) => `${d.name} x${d.quantity}`) || [],
          })));
          setIsDemo(false);
        }
      })
      .catch(() => {});
  }, [dateRange.start, dateRange.end]);

  const orderTypes = useMemo(() => Array.from(new Set(rows.map((row) => row.type))), [rows]);
  const waiters = useMemo(() => Array.from(new Set(rows.map((row) => row.waiter))), [rows]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const min = appliedFilters.minAmount ? Number(appliedFilters.minAmount) : null;
    const max = appliedFilters.maxAmount ? Number(appliedFilters.maxAmount) : null;
    return (
      (appliedFilters.orderType === "all" || row.type === appliedFilters.orderType) &&
      (appliedFilters.status === "all" || row.status === appliedFilters.status) &&
      (appliedFilters.waiter === "all" || row.waiter === appliedFilters.waiter) &&
      (!appliedFilters.place || row.place.toLowerCase().includes(appliedFilters.place.toLowerCase())) &&
      (!appliedFilters.client || row.client.toLowerCase().includes(appliedFilters.client.toLowerCase())) &&
      (!appliedFilters.courier || row.courier.toLowerCase().includes(appliedFilters.courier.toLowerCase())) &&
      (min === null || row.totalValue >= min) &&
      (max === null || row.totalValue <= max)
    );
  }), [rows, appliedFilters]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    setAppliedFilters(filters);
  }

  function downloadExcel() {
    window.alert("Excel-экспорт будет доступен в следующей версии");
  }

  return (
    <section className="orders-report-page">
      <article className="report-page-card">
        {isDemo && (
          <DemoNotice />
        )}
        <div className="report-page-header">
          <div className="report-title-group">
            <span className="report-accent-bar" aria-hidden="true" />
            <div>
              <h2>Заказы</h2>
            </div>
          </div>
          <div className="report-actions">
            <ReportDateRangePicker value={dateRange} onChange={setDateRange} />
            <button className="orders-filter-toggle" type="button" onClick={() => setFiltersOpen((value) => !value)}>
              <Icon name="bi-sliders" size={18} />
              Фильтровать
            </button>
            <button className="report-excel-button" type="button" onClick={downloadExcel}>
              <Icon name="bi-file-earmark-excel" size={18} />
              Скачать Excel
            </button>
          </div>
        </div>

        {filtersOpen ? (
          <div className="report-filter-panel">
            <label>
              <span>Тип заказа</span>
              <select value={filters.orderType} onChange={(event) => updateFilter("orderType", event.target.value)}>
                <option value="all">Все типы</option>
                {orderTypes.map((type) => <option value={type} key={type}>{type}</option>)}
              </select>
            </label>
            <label>
              <span>Статус заказа</span>
              <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
                <option value="all">Все статусы</option>
                <option value="Завершено">Завершено</option>
              </select>
            </label>
            <label>
              <span>Официант</span>
              <select value={filters.waiter} onChange={(event) => updateFilter("waiter", event.target.value)}>
                <option value="all">Все официанты</option>
                {waiters.map((waiter) => <option value={waiter} key={waiter}>{waiter}</option>)}
              </select>
            </label>
            <label>
              <span>Место / стол</span>
              <input value={filters.place} onChange={(event) => updateFilter("place", event.target.value)} placeholder="ЗАЛЛ, 6" />
            </label>
            <label>
              <span>Клиент</span>
              <input value={filters.client} onChange={(event) => updateFilter("client", event.target.value)} placeholder="Имя клиента" />
            </label>
            <label>
              <span>Курьер</span>
              <input value={filters.courier} onChange={(event) => updateFilter("courier", event.target.value)} placeholder="Курьер" />
            </label>
            <label>
              <span>Мин. сумма</span>
              <input value={filters.minAmount} onChange={(event) => updateFilter("minAmount", event.target.value)} inputMode="numeric" placeholder="0" />
            </label>
            <label>
              <span>Макс. сумма</span>
              <input value={filters.maxAmount} onChange={(event) => updateFilter("maxAmount", event.target.value)} inputMode="numeric" placeholder="100000" />
            </label>
            <button type="button" onClick={applyFilters}>
              <Icon name="bi-check2" size={18} />
              Применить
            </button>
          </div>
        ) : null}

        <div className="report-table-wrapper">
          <table className="report-table">
            <thead>
              <tr>
                <th>ID заказа</th>
                <th>Номер заказа</th>
                <th>Дата</th>
                <th>Тип</th>
                <th>Место</th>
                <th>Официант</th>
                <th>Клиент</th>
                <th>Курьер</th>
                <th>Цена товаров</th>
                <th>Цена места</th>
                <th>Скидка</th>
                <th>Цена доставки</th>
                <th>Цена обслуживания</th>
                <th>Цена всего</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} onClick={() => setSelectedOrder(row)}>
                  <td><strong>{row.id}</strong></td>
                  <td>{row.orderNumber}</td>
                  <td>{row.date}</td>
                  <td><span className="orders-type-pill">{row.type}</span></td>
                  <td>{row.place}</td>
                  <td>{row.waiter}</td>
                  <td className="report-muted-cell"><Icon name="bi-person" size={15} />{row.client}</td>
                  <td className="report-muted-cell"><Icon name="bi-truck" size={15} />{row.courier}</td>
                  <td>{row.goodsPrice}</td>
                  <td className={row.placePrice === "0 UZS" ? "report-muted-cell" : ""}>{row.placePrice}</td>
                  <td className={row.discount === "0 UZS" ? "report-muted-cell" : ""}>{row.discount}</td>
                  <td className={row.deliveryPrice === "0 UZS" ? "report-muted-cell" : ""}>{row.deliveryPrice}</td>
                  <td className={row.servicePrice === "0 UZS" ? "report-muted-cell" : ""}>{row.servicePrice}</td>
                  <td className="report-total-price">{row.totalPrice}</td>
                </tr>
              ))}
              {!filteredRows.length ? (
                <tr className="report-empty-row">
                  <td colSpan="14">По выбранным фильтрам заказов не найдено</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      {selectedOrder ? (
        <div className="order-details-drawer" role="dialog" aria-label="Детали заказа">
          <div className="order-details-drawer__backdrop" onClick={() => setSelectedOrder(null)} />
          <aside className="order-details-drawer__panel">
            <div className="order-details-drawer__head">
              <div>
                <span>Заказ</span>
                <h3>{selectedOrder.id}</h3>
              </div>
              <button type="button" onClick={() => setSelectedOrder(null)} aria-label="Закрыть">
                <Icon name="bi-x-lg" size={18} />
              </button>
            </div>
            <div className="order-details-drawer__grid">
              <div><span>Дата</span><strong>{selectedOrder.date}</strong></div>
              <div><span>Тип заказа</span><strong>{selectedOrder.type}</strong></div>
              <div><span>Стол / место</span><strong>{selectedOrder.place}</strong></div>
              <div><span>Официант</span><strong>{selectedOrder.waiter}</strong></div>
            </div>
            <div className="order-details-drawer__dishes">
              <span>Блюда</span>
              {selectedOrder.dishes.map((dish) => <strong key={dish}>{dish}</strong>)}
            </div>
            <div className="order-details-drawer__totals">
              <div><span>Сумма товаров</span><strong>{selectedOrder.goodsPrice}</strong></div>
              <div><span>Обслуживание</span><strong>{selectedOrder.servicePrice}</strong></div>
              <div><span>Итоговая сумма</span><strong>{selectedOrder.totalPrice}</strong></div>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
