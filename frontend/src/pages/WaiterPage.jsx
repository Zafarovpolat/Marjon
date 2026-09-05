import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import logo from "../assets/marjon-logo.svg";
import { api, formatMoney, logout } from "../api/client";
import { settingsService } from "../api/settings";
import { printKitchenReceipt, printOrderReceipt } from "../api/receipt";
import Icon from '../components/Icon';
import { getWsConnection } from "../api/ws";

const tableStatuses = ["free", "occupied"];
const statusLabels = { free: "Bo'sh", occupied: "Band" };
const activeOrderStatuses = ["new", "accepted", "cooking", "ready"];
const orderStatusLabels = {
  new: "Yangi",
  accepted: "Qabul qilingan",
  cooking: "Tayyorlanmoqda",
  ready: "Tayyor",
  completed: "Yakunlangan",
  cancelled: "Bekor qilingan",
};

// ── Canonical Hall/Table helpers (Phase 3) ──────────────────────────────────
// Real seating replaces the old hardcoded 1..50 grid. Identity is Table.id;
// Table.number/Hall.name are display-only. Backend already returns active-only
// data post-Phase-1; the is_active filters below are defensive.
function activeHalls(halls) {
  return (Array.isArray(halls) ? halls : [])
    .filter((hall) => hall && hall.is_active !== false)
    .map((hall) => ({
      id: hall.id,
      name: hall.name,
      tables: (Array.isArray(hall.tables) ? hall.tables : [])
        .filter((table) => table && table.is_active !== false)
        .map((table) => ({
          id: table.id,
          number: table.number,
          hallId: hall.id,
          hallName: hall.name,
        })),
    }));
}

function flattenTables(halls) {
  return activeHalls(halls).flatMap((hall) => hall.tables);
}

// Occupancy map: Table.id -> active Order.
//  * Canonical: order.table_id === table.id is authoritative.
//  * Legacy (order.table_id == null): attributed by table_number ONLY when that
//    number is unique across loaded tables. A legacy order whose number exists
//    in multiple halls is NOT attributed to any tile — never lighting up two
//    same-number tables from one ambiguous order.
function computeOccupancy(tables, orders) {
  const activeOrders = (Array.isArray(orders) ? orders : [])
    .filter((order) => activeOrderStatuses.includes(order.status))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  const occupied = new Map();
  for (const order of activeOrders) {
    if (order.table_id && !occupied.has(order.table_id)) occupied.set(order.table_id, order);
  }
  const tablesByNumber = new Map();
  for (const table of tables) {
    const key = String(table.number);
    tablesByNumber.set(key, (tablesByNumber.get(key) || []).concat(table));
  }
  for (const order of activeOrders) {
    if (order.table_id || order.table_number == null) continue;
    const matches = tablesByNumber.get(String(order.table_number));
    if (matches && matches.length === 1 && !occupied.has(matches[0].id)) {
      occupied.set(matches[0].id, order);
    }
  }
  return occupied;
}

function formatOrderTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function ensureBranch() {
  const { data } = await api.get("/companies/me/branches");
  if (data.length) return data[0];
  throw new Error("Филиал не настроен. Создайте филиал в настройках перед открытием POS.");
}

function WaiterShell({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const items = [
    { to: "/waiter", icon: "bi-grid-3x3-gap", label: "Stollar", exact: true },
    { to: "/waiter/new", icon: "bi-plus-circle", label: "Yangi buyurtma" },
    { to: "/waiter/orders", icon: "bi-receipt", label: "Buyurtmalarim" },
  ];

  return (
    <div className="pos-body">
      <aside className="pos-sidebar pos-sidebar--sleek pos-sidebar--ownerlike">
        <div className="pos-brand">
          <div className="pos-brand__mark"><img src={logo} alt="MARJON" className="marjon-logo" /></div>
          <div><strong>MARJON</strong><span>Ofitsiant POS</span></div>
        </div>
        <nav className="pos-nav">
          {items.map((item) => {
            const active = item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);
            return <Link key={item.to} to={item.to} className={active ? "is-active" : ""}><span className="pos-nav__icon"><Icon name={item.icon} size={18} /></span><span>{item.label}</span></Link>;
          })}
          <button type="button" onClick={handleLogout} className="pos-nav-button"><span className="pos-nav__icon"><Icon name="bi-box-arrow-right" size={18} /></span><span>Chiqish</span></button>
        </nav>
        <button type="button" onClick={handleLogout} className="pos-sidebar-user">
          <span className="pos-sidebar-user__avatar"><img src={logo} alt="MARJON" className="sidebar-user-logo" decoding="async" /></span>
          <span className="pos-sidebar-user__meta"><strong>ofitsiant</strong><small>waiter</small><em>MARJON</em></span>
          <Icon name="bi-chevron-right" size={18} />
        </button>
      </aside>
      <main className="pos-main pos-main--warm">{children}</main>
    </div>
  );
}

function TablesView({ halls, hallsState, orders, onRetry }) {
  const [status, setStatus] = useState("all");
  const [hallFilter, setHallFilter] = useState("all");
  const hallGroups = useMemo(() => activeHalls(halls), [halls]);
  const tables = useMemo(() => hallGroups.flatMap((hall) => hall.tables), [hallGroups]);
  const occupancy = useMemo(() => computeOccupancy(tables, orders), [tables, orders]);

  const statusOf = (table) => (occupancy.has(table.id) ? "occupied" : "free");
  const visibleHalls = hallFilter === "all" ? hallGroups : hallGroups.filter((hall) => hall.id === hallFilter);
  const scopedTables = visibleHalls.flatMap((hall) => hall.tables);
  const stats = {
    total: scopedTables.length,
    free: scopedTables.filter((table) => statusOf(table) === "free").length,
    occupied: scopedTables.filter((table) => statusOf(table) === "occupied").length,
  };
  const matchesStatus = (table) => status === "all" || statusOf(table) === status;

  function renderTile(table) {
    const isOccupied = occupancy.has(table.id);
    const order = occupancy.get(table.id);
    const content = (
      <>
        <span className="pos-table__status">{statusLabels[isOccupied ? "occupied" : "free"]}</span>
        <span className="pos-table__num">{table.number}</span>
        <span className="pos-table__meta">{table.hallName}</span>
        <small>{isOccupied ? `Buyurtma #${order?.order_number}` : "Yangi buyurtma"}</small>
      </>
    );
    if (isOccupied) {
      return <Link key={table.id} className="pos-table pos-table--occupied" to={`/waiter/order/${order?.id}`}>{content}</Link>;
    }
    return <Link key={table.id} className="pos-table pos-table--free" to={`/waiter/new?table_id=${table.id}`}>{content}</Link>;
  }

  return (
    <>
      <div className="pos-top pos-top--desktop pos-hero-card">
        <div><span className="pos-kicker">Ofitsiant ish joyi</span><h1>Stollar</h1><p>MARJON</p></div>
        <div className="pos-top__actions"><Link className="pos-btn pos-btn--ghost" to="/waiter/orders">Buyurtmalar</Link><Link className="pos-btn" to="/waiter/new">+ Yangi buyurtma</Link></div>
      </div>
      <section className="pos-overview" aria-label="Table summary">
        <div className="pos-stat"><span>Jami</span><strong>{stats.total}</strong></div>
        <div className="pos-stat pos-stat--free"><span>Bo'sh</span><strong>{stats.free}</strong></div>
        <div className="pos-stat pos-stat--occupied"><span>Band</span><strong>{stats.occupied}</strong></div>
      </section>
      <section className="pos-workspace pos-workspace--tables">
        <section className="pos-table-board pos-card-soft">
          <div className="pos-table-toolbar">
            <div className="pos-combo-field">
              <label htmlFor="waiter-hall-filter">Zal</label>
              <select id="waiter-hall-filter" value={hallFilter} onChange={(event) => setHallFilter(event.target.value)} className="pos-select">
                <option value="all">Barcha zallar</option>
                {hallGroups.map((hall) => <option key={hall.id} value={hall.id}>{hall.name}</option>)}
              </select>
            </div>
            <div className="pos-combo-field">
              <label htmlFor="waiter-status-filter">Holat</label>
              <select id="waiter-status-filter" value={status} onChange={(event) => setStatus(event.target.value)} className="pos-select">
                <option value="all">Barchasi</option>
                {tableStatuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}
              </select>
            </div>
          </div>
          <div className="pos-board-head"><div><h2>Joylar xaritasi</h2><p>Bo'sh stol yangi buyurtma ochadi, band stol buyurtma sahifasiga olib o'tadi.</p></div></div>
          {hallsState === "loading" ? (
            <div className="pos-empty-inline" role="status">Stollar yuklanmoqda...</div>
          ) : hallsState === "error" ? (
            <div className="pos-empty-inline" role="alert">
              Stollarni yuklab bo'lmadi.{" "}
              <button type="button" className="pos-btn pos-btn--ghost" onClick={onRetry}>Qayta urinish</button>
            </div>
          ) : !tables.length ? (
            <div className="pos-empty-inline" role="status">Faol stollar yo'q. Zal va stollarni sozlamalarda qo'shing.</div>
          ) : (
            visibleHalls.map((hall) => {
              const tiles = hall.tables.filter(matchesStatus);
              if (!tiles.length) return null;
              return (
                <div key={hall.id} className="pos-hall-group">
                  <div className="pos-board-head"><div><h2>{hall.name}</h2></div></div>
                  <div className="pos-table-grid">{tiles.map(renderTile)}</div>
                </div>
              );
            })
          )}
        </section>
      </section>
    </>
  );
}

function NewOrderView({ branch, categories, products, halls, hallsState, onCreated, onRetry }) {
  const location = useLocation();
  const navigate = useNavigate();
  const hallGroups = useMemo(() => activeHalls(halls), [halls]);
  const tables = useMemo(() => hallGroups.flatMap((hall) => hall.tables), [hallGroups]);
  const requestedTableId = new URLSearchParams(location.search).get("table_id") || "";
  const [tableId, setTableId] = useState("");
  const [cart, setCart] = useState([]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const total = cart.reduce((sum, row) => sum + Number(row.price || 0) * row.qty, 0);
  const totalItems = cart.reduce((sum, row) => sum + row.qty, 0);

  // Preselect ONLY a valid ?table_id that exists in the loaded active tables
  // (free-tile / "+доп заказ" navigation). No table_id, a stale/foreign id, or
  // no tables → nothing selected. Never auto-pick a table for the waiter.
  useEffect(() => {
    const valid = requestedTableId && tables.some((table) => table.id === requestedTableId);
    setTableId(valid ? requestedTableId : "");
  }, [tables, requestedTableId]);

  const selectedTable = tables.find((table) => table.id === tableId) || null;

  const grouped = useMemo(() => {
    const byCategory = new Map(categories.map((category) => [category.id, { ...category, items: [] }]));
    products.forEach((product) => {
      const target = byCategory.get(product.category_id) || byCategory.get("other");
      if (target) target.items.push(product);
    });
    const groups = [...byCategory.values()].filter((group) => group.items.length);
    const uncategorized = products.filter((product) => !product.category_id || !byCategory.has(product.category_id));
    if (uncategorized.length) groups.push({ id: "other", name: "Boshqa", items: uncategorized });
    return groups;
  }, [categories, products]);
  const visibleGroups = selectedCategory === "all" ? grouped : grouped.filter((group) => String(group.id) === selectedCategory);

  function addProduct(product) {
    setCart((current) => {
      const existing = current.find((row) => row.id === product.id);
      if (existing) return current.map((row) => row.id === product.id ? { ...row, qty: row.qty + 1 } : row);
      return [...current, { id: product.id, name: product.name, price: product.price, qty: 1 }];
    });
  }

  function changeQty(id, diff) {
    setCart((current) => current
      .map((row) => row.id === id ? { ...row, qty: row.qty + diff } : row)
      .filter((row) => row.qty > 0));
  }

  async function submitOrder() {
    if (!cart.length || !branch?.id) return;
    if (!selectedTable) {
      setMessage("Stol tanlang.");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      // Canonical identity: send table_id only. The backend validates
      // tenant/branch/active ownership and owns the table_number snapshot.
      const { data: order } = await api.post("/pos/orders", {
        branch_id: branch.id,
        order_type: "dine_in",
        table_id: selectedTable.id,
        persons_count: 1,
        note,
        items: cart.map((row) => ({ product_id: row.id, quantity: row.qty })),
      });
      await api.patch(`/pos/orders/${order.id}/status`, { status: "accepted" });
      setCart([]);
      setNote("");
      setMessage(`Buyurtma #${order.order_number} oshxonaga yuborildi`);
      onCreated?.();
      window.setTimeout(() => navigate("/waiter/orders"), 600);
    } catch (err) {
      setMessage(err.response?.data?.detail || "Buyurtmani yaratib bo'lmadi.");
    } finally {
      setSubmitting(false);
    }
  }

  const heroTitle = selectedTable
    ? `${selectedTable.hallName} · Stol ${selectedTable.number}`
    : "Stol tanlanmagan";

  return (
    <>
      <div className="pos-top pos-hero-card pos-order-hero">
        <div>
          <span className="pos-kicker">Yangi buyurtma</span>
          <h1>{heroTitle}</h1>
          <p>{"Stol -> menyu -> savat -> oshxona"}</p>
        </div>
        <div className="pos-order-hero__meta">
          <span>{grouped.length} bo'lim</span>
          <strong>{totalItems} ta mahsulot</strong>
        </div>
      </div>
      {message ? <div className="pos-msg">{message}</div> : null}
      <div className="pos-layout pos-order-layout">
        <section className="pos-menu-terminal">
          <div className="pos-card pos-card-soft pos-table-picker">
            <label htmlFor="waiter-table-picker"><strong>Stol</strong></label>
            {hallsState === "loading" ? (
              <div className="pos-empty-inline" role="status">Stollar yuklanmoqda...</div>
            ) : hallsState === "error" ? (
              <div className="pos-empty-inline" role="alert">
                Stollarni yuklab bo'lmadi.{" "}
                <button type="button" className="pos-btn pos-btn--ghost" onClick={onRetry}>Qayta urinish</button>
              </div>
            ) : !tables.length ? (
              <div className="pos-empty-inline" role="status">Faol stollar yo'q. Zal va stollarni sozlamalarda qo'shing.</div>
            ) : (
              <select id="waiter-table-picker" value={tableId} onChange={(event) => setTableId(event.target.value)} className="pos-select">
                <option value="">— Stolni tanlang —</option>
                {hallGroups.map((hall) => (
                  <optgroup key={hall.id} label={hall.name}>
                    {hall.tables.map((table) => (
                      <option key={table.id} value={table.id}>№{table.number}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
          </div>
          <div className="pos-order-screen">
            <div className="pos-menu-category-combo">
              <label htmlFor="waiter-menu-category">Kategoriya</label>
              <select id="waiter-menu-category" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className="pos-select">
                <option value="all">Barcha kategoriyalar</option>
                {grouped.map((group) => <option key={group.id} value={group.id}>{group.name} ({group.items.length})</option>)}
              </select>
            </div>
            <div className="pos-menu-content">
              {visibleGroups.map((group, groupIndex) => (
                <div key={group.id} className="pos-menu-section">
                  <div className="pos-section-head">
                    <div>
                      <span className="pos-section-kicker">Menu bo'limi</span>
                      <h2 id={`cat-${group.id}`}>{group.name}</h2>
                    </div>
                    <strong>{group.items.length} ta</strong>
                  </div>
                  <div className="pos-menu-grid pos-menu-grid--rich">
                    {group.items.map((product, productIndex) => (
                      <article className="pos-dish pos-dish--rich" key={product.id}>
                        <button className="pos-dish__quick" type="button" onClick={() => addProduct(product)}>+</button>
                        <div className={`pos-dish__ph pos-dish__ph--${(groupIndex + productIndex) % 5}`}>
                          <span>{product.name?.slice(0, 2).toUpperCase() || "MJ"}</span>
                        </div>
                        <div className="pos-dish__body">
                          <strong>{product.name}</strong>
                          <p>{product.description || "Tayyor taom"}</p>
                          <div className="pos-dish__footer">
                            <div className="pos-dish__price">{formatMoney(product.price)}</div>
                            <button className="pos-btn" type="button" onClick={() => addProduct(product)}>Qo'shish</button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {!products.length ? <div className="pos-card">Menyu hali bo'sh.</div> : null}
        </section>
        <aside className="pos-card pos-cart-card">
          <div className="pos-cart-head">
            <div>
              <span>{selectedTable ? `${selectedTable.hallName} · Stol ${selectedTable.number}` : "Stol tanlanmagan"}</span>
              <h2>Savat</h2>
            </div>
            <strong>{totalItems}</strong>
          </div>
          <div className="pos-cart-lines">{cart.length ? cart.map((row) => <div className="pos-cart-line" key={row.id}><div><strong>{row.name}</strong><span>{formatMoney(row.price)}</span></div><div className="pos-qty"><button type="button" onClick={() => changeQty(row.id, -1)}>-</button><b>{row.qty}</b><button type="button" onClick={() => changeQty(row.id, 1)}>+</button></div></div>) : <div className="pos-cart-empty">Savat bo'sh. Menyudan taom qo'shing.</div>}</div>
          <div className="pos-cart-total"><span>Jami</span><strong>{formatMoney(total)}</strong></div>
          <label>Izoh</label>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows="3" className="pos-textarea" />
          <div className="pos-cart-actions"><button className="pos-btn pos-btn--ghost" type="button" onClick={() => setCart([])}>Tozalash</button><button className="pos-btn" type="button" disabled={!cart.length || submitting || !selectedTable} onClick={submitOrder}>{submitting ? "Yuborilmoqda..." : "Oshxonaga"}</button></div>
        </aside>
      </div>
    </>
  );
}

function OrdersView({ orders }) {
  return (
    <>
      <div className="pos-top pos-hero-card"><h1>Bugungi buyurtmalar</h1><Link className="pos-btn" to="/waiter/new">+ Yangi</Link></div>
      {orders.map((order) => <article className="pos-card pos-order-row" key={order.id}><div><strong>Buyurtma #{order.order_number}</strong><div>Stol {order.table_number ? `№${order.table_number}` : "-"}</div><div>{order.items?.map((item) => `${item.name} x${Number(item.quantity)}`).join(", ") || "Mahsulotlar yo'q"}</div></div><div><strong>{formatMoney(order.total_amount)}</strong><span>{order.status}</span></div></article>)}
      {!orders.length ? <div className="pos-card">Bugun buyurtmalar yo'q.</div> : null}
    </>
  );
}

function OrderDetailView({ orders }) {
  const { orderId } = useParams();
  const order = orders.find((item) => String(item.id) === String(orderId));
  const items = order?.items || [];
  const [printState, setPrintState] = useState({ loading: false, message: "", error: "" });

  async function handlePrint(type) {
    if (!order?.id) return;
    setPrintState({ loading: true, message: "", error: "" });
    const result = type === "kitchen"
      ? await printKitchenReceipt(order.id)
      : await printOrderReceipt(order.id);
    setPrintState({
      loading: false,
      message: result.ok ? "Chop etishga yuborildi." : "",
      error: result.ok ? "" : result.detail,
    });
  }

  if (!order) {
    return (
      <>
        <div className="pos-top pos-hero-card"><h1>Buyurtma</h1><Link className="pos-btn pos-btn--ghost" to="/waiter">Stollarga qaytish</Link></div>
        <div className="pos-card">Buyurtma yuklanmoqda yoki topilmadi.</div>
      </>
    );
  }

  return (
    <>
      <div className="pos-top pos-hero-card pos-order-detail-hero">
        <div>
          <span className="pos-kicker">Band stol #{order.table_number}</span>
          <h1>Buyurtma #{order.order_number}</h1>
          <p>Qabul qilingan: {formatOrderTime(order.created_at)}</p>
        </div>
        <div className="pos-top__actions">
          <Link className="pos-btn pos-btn--ghost" to="/waiter">Stollarga qaytish</Link>
          <button className="pos-btn pos-btn--ghost" type="button" disabled={printState.loading} onClick={() => handlePrint("customer")}>
            {printState.loading ? "Chop..." : "Печать чека"}
          </button>
          <button className="pos-btn pos-btn--ghost" type="button" disabled={printState.loading} onClick={() => handlePrint("kitchen")}>
            {printState.loading ? "Chop..." : "Печать на кухню"}
          </button>
          <Link className="pos-btn" to={order.table_id ? `/waiter/new?table_id=${order.table_id}` : "/waiter/new"}>+ Qo'shimcha buyurtma</Link>
        </div>
      </div>
      {printState.error ? <div className="pos-msg">{printState.error}</div> : null}
      {printState.message ? <div className="pos-msg">{printState.message}</div> : null}
      <section className="pos-active-order pos-active-order--page">
        <div className="pos-active-order__meta">
          <div><span>Status</span><strong>{orderStatusLabels[order.status] || order.status}</strong></div>
          <div><span>Mahsulotlar</span><strong>{items.length} nom</strong></div>
          <div><span>Jami</span><strong>{formatMoney(order.total_amount)}</strong></div>
        </div>
        <div className="pos-active-order__items">
          {items.length ? items.map((item) => (
            <div className="pos-active-order__item" key={item.id}>
              <div><strong>{item.name}</strong><span>{formatMoney(item.price)} x {Number(item.quantity)}</span></div>
              <b>{formatMoney(item.total)}</b>
            </div>
          )) : <div className="pos-cart-empty">Mahsulotlar yo'q.</div>}
        </div>
        {order.note ? <p className="pos-active-order__note">Izoh: {order.note}</p> : null}
      </section>
    </>
  );
}

export default function WaiterPage({ mode = "tables" }) {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [branch, setBranch] = useState(null);
  const [halls, setHalls] = useState([]);
  const [hallsState, setHallsState] = useState("loading"); // loading | ready | error
  const [error, setError] = useState("");

  // Hall/Table loading is isolated from the menu/orders load so a seating fetch
  // failure surfaces its own retry in the table area without blanking the page.
  async function loadHalls(branchId) {
    if (!branchId) return;
    setHallsState("loading");
    try {
      const { data } = await settingsService.listResource("places", { params: { branch_id: branchId } });
      setHalls(Array.isArray(data) ? data : data?.items || []);
      setHallsState("ready");
    } catch {
      setHalls([]);
      setHallsState("error");
    }
  }

  async function loadData() {
    const activeBranch = await ensureBranch();
    const [ordersRes, productsRes, categoriesRes] = await Promise.all([
      api.get("/pos/orders"),
      api.get("/inventory/products"),
      api.get("/inventory/categories"),
    ]);
    setBranch(activeBranch);
    setOrders(ordersRes.data);
    setProducts(productsRes.data.filter((product) => product.is_active && product.is_available));
    setCategories(categoriesRes.data.filter((category) => category.is_active));
    await loadHalls(activeBranch.id);
  }

  useEffect(() => {
    loadData().catch((err) => setError(err.response?.data?.detail || "POS ma'lumotlarini yuklab bo'lmadi."));

    // Realtime: зал официанта обновляется по событиям кухни. Если сокет закрыт,
    // включается опрос раз в 10 с и гаснет обратно при успешном open.
    const ws = getWsConnection("/ws/kitchen");
    let fallbackTimer = null;
    const refresh = () => loadData().catch(() => {});

    const unsubs = [
      ws.on("new_order",       refresh),
      ws.on("order_updated",   refresh),
      ws.on("order_cancelled", refresh),
    ];
    ws.onOpen(() => { if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null; } });
    ws.onClose(() => { if (!fallbackTimer) fallbackTimer = window.setInterval(refresh, 10_000); });
    ws.connect();
    fallbackTimer = window.setInterval(refresh, 10_000);

    return () => {
      unsubs.forEach((fn) => fn());
      ws.disconnect();
      if (fallbackTimer) clearInterval(fallbackTimer);
    };
  }, []);

  const retryHalls = () => loadHalls(branch?.id);

  return (
    <WaiterShell>
      {error ? <div className="pos-msg">{error}</div> : null}
      {mode === "new"
        ? <NewOrderView branch={branch} categories={categories} products={products} halls={halls} hallsState={hallsState} onCreated={loadData} onRetry={retryHalls} />
        : mode === "orders" ? <OrdersView orders={orders} />
        : mode === "order" ? <OrderDetailView orders={orders} />
        : <TablesView halls={halls} hallsState={hallsState} orders={orders} onRetry={retryHalls} />}
    </WaiterShell>
  );
}
