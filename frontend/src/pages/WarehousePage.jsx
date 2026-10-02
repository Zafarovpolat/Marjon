import { useEffect, useMemo, useState } from "react";
import { warehouseService } from "../api/warehouse";
import { isAbortError, useLatestRequest } from "../hooks/useAsyncSafety";
import Icon from "../components/Icon";
import PurchaseDrawer from "./warehouse/PurchaseDrawer";
import ExpenseDrawer from "./warehouse/ExpenseDrawer";
import WasteDrawer from "./warehouse/WasteDrawer";

const ACTIVE = "active";
const ARCHIVE = "archive";

const sectionAliases = {
  "stock-in": "incoming",
  "stock-out": "outgoing",
  balance: "stock",
  "income-log": "incoming-journal",
  expense: "outgoing",
};

const warehouseConfigs = {
  incoming: {
    title: "Приход товаров",
    primaryAction: "Новый приход +",
    drawerTitle: "Новый приход",
    importExcel: true,
    tabs: true,
    editable: true,
    itemDrawer: true,
    summary: [
      { label: "Всего приходов", icon: "bi-box-arrow-in-down", tone: "blue" },
      { label: "Сумма прихода", icon: "bi-cash-stack", tone: "green" },
      { label: "Поставщиков", icon: "bi-people", tone: "purple" },
      { label: "Черновики", icon: "bi-journal-text", tone: "orange" },
    ],
    filters: [
      ["date", "Дата", "01.06.2026 - 23.06.2026"],
      ["warehouse", "Склад", "Все"],
      ["supplier", "Поставщик", "Все"],
      ["status", "Статус", "Все"],
    ],
    columns: ["№", "Документ", "Поставщик", "Склад", "Сумма", "Статус", "Дата", "Действия"],
  },
  outgoing: {
    title: "Расход товаров",
    primaryAction: "Новый расход +",
    drawerTitle: "Новый расход",
    tabs: true,
    editable: true,
    summary: [
      { label: "Всего расходов", icon: "bi-box-arrow-up", tone: "blue" },
      { label: "Сумма расхода", icon: "bi-cash-stack", tone: "green" },
      { label: "Проведено", icon: "bi-check2-circle", tone: "purple" },
      { label: "В ожидании", icon: "bi-clock-history", tone: "orange" },
    ],
    filters: [
      ["warehouse", "Склад", "Все"],
      ["receiver", "Получатель", "Все"],
      ["status", "Статус", "Все"],
    ],
    columns: ["№", "Документ", "Получатель / Категория", "Склад", "Сумма", "Статус", "Дата", "Действия"],
  },
  stock: {
    title: "Остаток товаров",
    primaryAction: "",
    summary: [
      { label: "Всего позиций", icon: "bi-boxes", tone: "blue" },
      { label: "Общая стоимость", icon: "bi-cash-stack", tone: "green" },
      { label: "Низкий остаток", icon: "bi-exclamation-triangle", tone: "orange" },
      { label: "Складов", icon: "bi-building", tone: "purple" },
    ],
    filters: [
      ["category", "Категория", "Все"],
      ["warehouse", "Склад", "Все"],
      ["status", "Статус", "Все"],
    ],
    columns: ["Товар", "Категория", "Склад", "Остаток", "Мин. остаток", "Ед. изм", "Цена", "Сумма", "Статус"],
  },
  "incoming-journal": {
    title: "Журнал приходов",
    // Документ-уровень: бэкенд отдаёт список приходов без построчных товаров,
    // поэтому журнал показывает документы (кол-во позиций и сумму), не строки.
    summary: [
      { label: "Всего приходов", icon: "bi-box-arrow-in-down", tone: "blue" },
      { label: "Сумма прихода", icon: "bi-cash-stack", tone: "green" },
      { label: "Поставщиков", icon: "bi-people", tone: "purple" },
      { label: "Черновики", icon: "bi-journal-text", tone: "orange" },
    ],
    filters: [
      ["warehouse", "Склад", "Все"],
      ["supplier", "Поставщик", "Все"],
      ["status", "Статус", "Все"],
    ],
    columns: ["Дата", "Документ", "Поставщик", "Склад", "Позиций", "Сумма", "Статус", "Автор"],
  },
  transfer: {
    title: "Перемещение",
    primaryAction: "Новое перемещение +",
    drawerTitle: "Новое перемещение",
    tabs: true,
    editable: true,
    filters: [
      ["from", "Со склада", "Все"],
      ["to", "На склад", "Все"],
      ["status", "Статус", "Все"],
    ],
    columns: ["№", "Документ", "Со склада", "На склад", "Кол-во позиций", "Сумма", "Статус", "Дата", "Действия"],
  },
  inventory: {
    title: "Инвентаризация",
    // Отчёт только для чтения: бэкенд отдаёт проверки без структурных
    // план/факт/расхождение (эти данные лежат в тексте комментария).
    filters: [
      ["warehouse", "Склад", "Все"],
      ["status", "Статус", "Все"],
    ],
    columns: ["Дата", "Склад", "Тип проверки", "Комментарий", "Статус", "Автор"],
  },
  "write-off": {
    title: "Списание",
    // Отчёт только для чтения: бэкенд отдаёт списания без склада и без
    // структурной суммы (сумма может быть в тексте примечания).
    filters: [
      ["category", "Категория", "Все"],
      ["status", "Статус", "Все"],
    ],
    columns: ["Дата", "Категория", "Позиций", "Статус", "Автор", "Примечание"],
  },
  "write-off-categories": {
    title: "Категории списания",
    // Клиентская агрегация /warehouse/write-offs по категории (отдельного
    // эндпоинта нет): сколько документов и позиций в каждой категории.
    filters: [["category", "Категория", "Все"]],
    columns: ["Категория", "Документов", "Позиций"],
  },
  waste: {
    title: "Отход товаров",
    primaryAction: "Добавить отход +",
    drawerTitle: "Добавить отход",
    tabs: true,
    editable: true,
    summary: [
      { label: "Всего отходов", icon: "bi-recycle", tone: "blue" },
      { label: "Сумма отходов", icon: "bi-cash-stack", tone: "green" },
      { label: "Автоотход", icon: "bi-gear", tone: "purple" },
      { label: "Ручной отход", icon: "bi-pencil", tone: "orange" },
    ],
    filters: [
      ["category", "Категория", "Все"],
      ["author", "Автор", "Все"],
    ],
    columns: ["Дата", "Категория", "Товар", "Ед. изм", "Кол-во", "Сумма", "Автор", "Причина", "Действия"],
  },
};

// WH-01: остаток (stock), расход (outgoing) и отход (waste) разморожены —
// грузятся и мутируются как приход. Остальные разделы пока отложены: их backend
// contract под этот экран не подключён либо не соответствует семантике, поэтому
// показываем честный статус вместо пустых нулей (см. CLAUDE.md §5.1).
const sectionUnavailableMessages = {
  "incoming-journal": "Журнал приходов недоступен: подтверждённый backend contract не предоставляет строки товаров.",
  inventory: "Инвентаризация недоступна до завершения Inventory Core.",
  "write-off": "Документы списания недоступны: подтверждённый backend contract не соответствует семантике этого экрана.",
  "write-off-categories": "Категории списания недоступны: подтверждённый backend contract не подключён.",
};

// Диспетчеризация мутаций по секциям: приход/расход/отход делят один UI, но
// бьют в разные эндпоинты. Проведение везде = PATCH status:"accepted"
// (приход увеличивает остаток, расход и отход — уменьшают, при нехватке 422).
const sectionMutations = {
  incoming: {
    create: (payload) => warehouseService.createPurchase(payload),
    accept: (id) => warehouseService.acceptPurchase(id),
    remove: (id) => warehouseService.deletePurchase(id),
    createLabel: "приход",
    acceptConfirm: "Провести приход? Остатки увеличатся.",
    deleteConfirm: "Удалить приход? Действие необратимо.",
    acceptTitle: "Провести приход",
    deleteTitle: "Удалить приход",
  },
  outgoing: {
    create: (payload) => warehouseService.createExpense(payload),
    accept: (id) => warehouseService.acceptExpense(id),
    remove: (id) => warehouseService.deleteExpense(id),
    createLabel: "расход",
    acceptConfirm: "Провести расход? Остатки уменьшатся.",
    deleteConfirm: "Удалить расход? Действие необратимо.",
    acceptTitle: "Провести расход",
    deleteTitle: "Удалить расход",
  },
  waste: {
    create: (payload) => warehouseService.createWaste(payload),
    accept: (id) => warehouseService.acceptWaste(id),
    remove: (id) => warehouseService.deleteWaste(id),
    createLabel: "отход",
    acceptConfirm: "Провести отход? Остаток уменьшится.",
    deleteConfirm: "Удалить отход? Действие необратимо.",
    acceptTitle: "Провести отход",
    deleteTitle: "Удалить отход",
  },
};

const WAREHOUSE_WRITE_UNAVAILABLE = "Изменения недоступны до подключения подтверждённого Warehouse write contract.";

function normalizeSection(section) {
  return sectionAliases[section] || section || "incoming";
}

function formatAmount(value) {
  return `${new Intl.NumberFormat("ru-RU").format(Number(value) || 0)} UZS`;
}

function formatQty(value) {
  return new Intl.NumberFormat("ru-RU").format(Number(value) || 0);
}

// Экран остатков собирается на клиенте: /inventory/stock даёт числа по паре
// (ingredient_id, warehouse_id), но без названий — имя товара/ед.изм берём из
// /inventory/ingredients, имя склада из /warehouse/list. Статус выводим из
// количества и мин. остатка (так же, как трактует «низкий остаток» сводка).
function buildStockRows(stock, ingredients, warehouses) {
  const ingredientById = new Map((ingredients || []).map((ing) => [ing.id, ing]));
  const warehouseById = new Map((warehouses || []).map((wh) => [wh.id, wh]));
  return (Array.isArray(stock) ? stock : []).map((item, idx) => {
    const ing = ingredientById.get(item.ingredient_id);
    const wh = warehouseById.get(item.warehouse_id);
    const quantity = Number(item.quantity) || 0;
    const minQuantity = Number(item.min_quantity) || 0;
    const price = Number(item.cost_price) || 0;
    let status = "Норма";
    if (quantity <= 0) status = "Нет в наличии";
    else if (minQuantity > 0 && quantity <= minQuantity) status = "Низкий остаток";
    return {
      id: `${item.warehouse_id || "wh"}-${item.ingredient_id || idx}`,
      product: ing?.name || "—",
      category: ing?.category || "—",
      warehouse: wh?.name || "—",
      stock: formatQty(quantity),
      minStock: minQuantity ? formatQty(minQuantity) : "—",
      unit: item.unit || ing?.unit || "—",
      price: formatAmount(price),
      total: formatAmount(quantity * price),
      status,
      archiveState: ACTIVE,
    };
  });
}

// Бэкенд отдаёт статусы документов по-английски (draft/accepted/completed…) —
// приводим к русским меткам, которые понимает бейдж statusTone.
function translateDocStatus(status) {
  const map = { draft: "Черновик", accepted: "Принято", completed: "Завершено", cancelled: "Отменено", canceled: "Отменено", pending: "В ожидании" };
  const key = String(status || "").toLowerCase();
  return map[key] || (status || "—");
}

function mapWarehouseReadRow(section, item) {
  if (section === "incoming") {
    // Бэкенд отдаёт status "draft"/"accepted"; проведённый документ также имеет
    // accepted_at. Приводим к русской метке для бейджа и держим булев флаг
    // accepted — по нему прячем кнопку «Провести» и красим статус в green.
    const accepted = item.status === "accepted" || Boolean(item.accepted_at);
    return {
      id: item.id,
      document: item.number == null ? "—" : String(item.number),
      supplier: item.supplier || "—",
      warehouse: item.warehouse_name || "—",
      total: item.total_amount == null ? "—" : formatAmount(item.total_amount),
      status: accepted ? "Принято" : "Черновик",
      accepted,
      date: item.date || "",
      positions: String(item.items_count ?? "—"),
      registeredAt: item.registered_at || "",
      acceptedAt: item.accepted_at || "",
      author: item.created_by_name || "",
      archiveState: ACTIVE,
    };
  }

  if (section === "transfer") {
    return {
      id: item.id,
      document: "—",
      from: item.from_warehouse_name || "—",
      to: item.to_warehouse_name || "—",
      positions: String(item.items_count ?? "—"),
      total: "—",
      status: translateDocStatus(item.status),
      date: item.date || "",
      archiveState: ACTIVE,
    };
  }

  if (section === "incoming-journal") {
    const accepted = item.status === "accepted" || Boolean(item.accepted_at);
    return {
      id: item.id,
      date: item.date || (item.created_at || "").slice(0, 10) || "—",
      document: item.number == null ? "—" : String(item.number),
      supplier: item.supplier || "—",
      warehouse: item.warehouse_name || "—",
      positions: String(item.items_count ?? "—"),
      total: item.total_amount == null ? "—" : formatAmount(item.total_amount),
      status: accepted ? "Принято" : "Черновик",
      author: item.created_by_name || "—",
      archiveState: ACTIVE,
    };
  }

  if (section === "inventory") {
    return {
      id: item.id,
      date: (item.created_at || "").slice(0, 10) || "—",
      warehouse: item.warehouse_name || "—",
      checkType: item.check_type || "—",
      comment: item.comment || "—",
      status: translateDocStatus(item.status),
      author: item.created_by_name || "—",
      archiveState: ACTIVE,
    };
  }

  if (section === "write-off") {
    return {
      id: item.id,
      date: (item.created_at || "").slice(0, 10) || "—",
      category: item.category || "—",
      positions: String(item.items_count ?? "—"),
      status: translateDocStatus(item.status),
      author: item.created_by_name || "—",
      note: item.note || "—",
      archiveState: ACTIVE,
    };
  }

  if (section === "outgoing") {
    // Документ расхода зеркалит приход: number/receiver/warehouse/total/status.
    // accepted прячет кнопку «Провести» и красит статус в green.
    const accepted = item.status === "accepted" || Boolean(item.accepted_at);
    return {
      id: item.id,
      document: item.number == null ? "—" : String(item.number),
      receiver: item.receiver || "—",
      warehouse: item.warehouse_name || "—",
      total: item.total_amount == null ? "—" : formatAmount(item.total_amount),
      status: accepted ? "Принято" : "Черновик",
      accepted,
      date: item.date || "",
      positions: String(item.items_count ?? "—"),
      author: item.created_by_name || "",
      archiveState: ACTIVE,
    };
  }

  if (section === "waste") {
    // Построчный документ отхода (одна позиция). isAutomatic питает сводки
    // «Автоотход»/«Ручной отход»; accepted управляет кнопкой «Провести».
    const accepted = item.status === "accepted" || Boolean(item.accepted_at);
    return {
      id: item.id,
      date: item.date || (item.created_at || "").slice(0, 10) || "—",
      category: item.category || "—",
      product: item.name || "—",
      unit: item.unit || "—",
      quantity: formatQty(item.quantity),
      total: item.total_amount == null ? "—" : formatAmount(item.total_amount),
      author: item.created_by_name || "—",
      reason: item.reason || "—",
      status: accepted ? "Принято" : "Черновик",
      accepted,
      isAutomatic: item.is_automatic ?? null,
      archiveState: ACTIVE,
    };
  }

  return { id: item.id, archiveState: ACTIVE };
  return Object.values(row).filter((value) => typeof value !== "object").join(" ").toLowerCase();
}

function statusTone(status) {
  if (["Проведено", "Принято", "Завершено", "Активно", "Норма"].includes(status)) return "green";
  if (["Черновик", "В ожидании", "Низкий остаток"].includes(status)) return "orange";
  if (["Отменено", "Нет в наличии"].includes(status)) return "red";
  return "gray";
}

function WarehousePage({ initialSection = "incoming" }) {
  const section = normalizeSection(initialSection);
  const config = warehouseConfigs[section] || warehouseConfigs.incoming;
  const unavailableMessage = sectionUnavailableMessages[section] || "";
  const mutation = sectionMutations[section] || null;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState(ACTIVE);
  const [draftFilters, setDraftFilters] = useState({ search: "", date: "01.06.2026 - 23.06.2026", warehouse: "", supplier: "", status: "", receiver: "", category: "", author: "", from: "", to: "" });
  const [filters, setFilters] = useState(draftFilters);
  // reloadKey форсит перезагрузку списка после мутаций (создание/проведение/удаление).
  const [reloadKey, setReloadKey] = useState(0);
  // Дравер прихода + его справочники (склады/ингредиенты грузим лениво при открытии).
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [refData, setRefData] = useState({ warehouses: [], ingredients: [] });
  const [refLoaded, setRefLoaded] = useState(false);
  // id документа, по которому идёт проведение/удаление — блокирует его кнопки.
  const [busyId, setBusyId] = useState(null);
  const beginRequest = useLatestRequest();

  useEffect(() => {
    const request = beginRequest();
    if (unavailableMessage) {
      setRows([]);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const onError = (err) => {
      if (!request.isCurrent() || isAbortError(err)) return;
      setRows([]);
      setError(err.response?.data?.detail || "Не удалось загрузить складские данные.");
      setLoading(false);
    };

    if (section === "stock") {
      // Остатки — это джойн трёх источников (см. buildStockRows), а не один list().
      Promise.all([
        warehouseService.listStock({ signal: request.signal }),
        warehouseService.listIngredients({ signal: request.signal }),
        warehouseService.listWarehouses({ signal: request.signal }),
      ])
        .then(([stockRes, ingRes, whRes]) => {
          if (!request.isCurrent()) return;
          setRows(buildStockRows(stockRes.data, ingRes.data, whRes.data));
          setLoading(false);
        })
        .catch(onError);
      return;
    }

    if (section === "write-off-categories") {
      // Категорий как сущности в бэкенде нет — агрегируем документы списания
      // по полю category на клиенте (сколько документов и позиций в каждой).
      warehouseService.list("write-off", { signal: request.signal })
        .then(({ data }) => {
          if (!request.isCurrent()) return;
          const items = Array.isArray(data) ? data : data?.items || [];
          const byCategory = new Map();
          items.forEach((item) => {
            const name = item.category || "Без категории";
            const acc = byCategory.get(name) || { docs: 0, positions: 0 };
            acc.docs += 1;
            acc.positions += Number(item.items_count) || 0;
            byCategory.set(name, acc);
          });
          const catRows = Array.from(byCategory.entries()).map(([name, agg], idx) => ({
            id: `cat-${idx}`,
            category: name,
            count: String(agg.docs),
            positions: String(agg.positions),
            archiveState: ACTIVE,
          }));
          setRows(catRows);
          setLoading(false);
        })
        .catch(onError);
      return;
    }

    Promise.resolve().then(() => warehouseService.list(section, { signal: request.signal }))
      .then(({ data }) => {
        if (!request.isCurrent()) return;
        const items = Array.isArray(data) ? data : data?.items || [];
        setRows(items.map((item) => mapWarehouseReadRow(section, item)));
        setLoading(false);
      })
      .catch(onError);
  }, [beginRequest, section, unavailableMessage, reloadKey]);

  // Лениво тянем справочники для дравера (приход/расход/отход) — только при
  // первом открытии. Драйвер выбирается по секции при рендере (см. ниже).
  const openDrawer = async () => {
    if (!mutation) return;
    setSaveError("");
    setDrawerOpen(true);
    if (refLoaded) return;
    try {
      const [whRes, ingRes] = await Promise.all([
        warehouseService.listWarehouses(),
        warehouseService.listIngredients(),
      ]);
      setRefData({ warehouses: whRes.data || [], ingredients: ingRes.data || [] });
      setRefLoaded(true);
    } catch {
      // Справочники не загрузились — селекты в дравере будут пустыми,
      // пользователь увидит это сам; форму не блокируем жёстко.
    }
  };

  const handleCreate = async (payload) => {
    if (!mutation) return;
    setSaving(true);
    setSaveError("");
    try {
      await mutation.create(payload);
      setDrawerOpen(false);
      setReloadKey((key) => key + 1);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setSaveError(typeof detail === "string" ? detail : `Не удалось сохранить ${mutation.createLabel}.`);
    } finally {
      setSaving(false);
    }
  };

  const handleAccept = async (id) => {
    if (!id || busyId || !mutation) return;
    if (!window.confirm(mutation.acceptConfirm)) return;
    setBusyId(id);
    setError("");
    try {
      await mutation.accept(id);
      setReloadKey((key) => key + 1);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Не удалось провести документ.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!id || busyId || !mutation) return;
    if (!window.confirm(mutation.deleteConfirm)) return;
    setBusyId(id);
    setError("");
    try {
      await mutation.remove(id);
      setReloadKey((key) => key + 1);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Не удалось удалить документ.");
    } finally {
      setBusyId(null);
    }
  };

  const computedSummary = useMemo(() => {
    if (!config.summary || loading || error) return null;
    const activeRows = rows.filter((r) => r.archiveState === ACTIVE);
    const totalCount = activeRows.length;
    const totalSum = activeRows.reduce((sum, r) => {
      const num = Number(String(r.total || "0").replace(/[^\d]/g, ""));
      return sum + num;
    }, 0);
    const uniqueSuppliers = new Set(activeRows.map((r) => r.supplier).filter(Boolean)).size;
    const uniqueWarehouses = new Set(activeRows.map((r) => r.warehouse).filter(Boolean)).size;
    const drafts = activeRows.filter((r) => (r.status || "").toLowerCase().includes("черновик")).length;
    const completed = activeRows.filter((r) => /проведено|завершено/i.test(r.status || "")).length;
    const pending = activeRows.filter((r) => /ожидани/i.test(r.status || "")).length;
    const lowStock = activeRows.filter((r) => (
      /низк/i.test(r.status || "")
      || (Number.isFinite(Number(r.stock)) && Number.isFinite(Number(r.minStock)) && Number(r.stock) < Number(r.minStock))
    )).length;
    const hasWasteMode = activeRows.some((r) => r.isAutomatic != null || r.mode || r.source);
    const automaticWaste = activeRows.filter((r) => r.isAutomatic === true || /авто|automatic/i.test(`${r.mode || ""} ${r.source || ""}`)).length;
    const manualWaste = activeRows.filter((r) => r.isAutomatic === false || /ручн|manual/i.test(`${r.mode || ""} ${r.source || ""}`)).length;

    return config.summary.map((item) => {
      if (item.label.includes("Всего")) return { ...item, value: String(totalCount) };
      if (item.label.includes("Сумма") || item.label.includes("стоимость")) return { ...item, value: `${totalSum.toLocaleString("ru-RU")} UZS` };
      if (item.label.includes("Поставщик")) return { ...item, value: String(uniqueSuppliers) };
      if (item.label.includes("Черновик")) return { ...item, value: String(drafts) };
      if (item.label.includes("Позиций") || item.label.includes("Товаров") || item.label.includes("Категорий")) return { ...item, value: String(totalCount) };
      if (item.label === "Проведено") return { ...item, value: String(completed) };
      if (item.label === "В ожидании") return { ...item, value: String(pending) };
      if (item.label === "Низкий остаток") return { ...item, value: String(lowStock) };
      if (item.label === "Складов") return { ...item, value: String(uniqueWarehouses) };
      if (item.label === "Автоотход") return { ...item, value: activeRows.length && !hasWasteMode ? "—" : String(automaticWaste) };
      if (item.label === "Ручной отход") return { ...item, value: activeRows.length && !hasWasteMode ? "—" : String(manualWaste) };
      return { ...item, value: "—" };
    });
  }, [rows, config.summary, error, loading]);

  const visibleRows = useMemo(() => {
    const query = filters.search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesTab = !config.tabs || row.archiveState === activeTab;
      const matchesSearch = !query || rowSearchText(row).includes(query);
      const matchesFilters = Object.entries(filters).every(([key, value]) => {
        if (!value || key === "search" || key === "date") return true;
        return String(row[key] || "").toLowerCase().includes(String(value).toLowerCase());
      });
      return matchesTab && matchesSearch && matchesFilters;
    });
  }, [activeTab, config.tabs, filters, rows]);

  if (unavailableMessage) {
    return (
      <div className="warehouse-page">
        <section className="warehouse-card">
          <header className="warehouse-header">
            <div className="warehouse-title-group">
              <span className="warehouse-accent-bar" />
              <div>
                <p>Склад</p>
                <h1>{config.title}</h1>
              </div>
            </div>
          </header>
          <div className="warehouse-empty-cell" role="status">{unavailableMessage}</div>
        </section>
      </div>
    );
  }

  return (
    <div className="warehouse-page">
      <section className="warehouse-card">
        {loading ? <div className="warehouse-empty-cell" role="status">Загрузка складских данных...</div> : null}
        {error ? <div className="login-error" role="alert">{error}</div> : null}
        <header className="warehouse-header">
          <div className="warehouse-title-group">
            <span className="warehouse-accent-bar" />
            <div>
              <p>Склад</p>
              <h1>{config.title}</h1>
            </div>
          </div>
          <div className="warehouse-actions">
            {config.importExcel ? <button type="button" onClick={() => window.alert("Импорт Excel будет доступен в следующей версии")}><Icon name="bi-file-earmark-spreadsheet" size={17} />Импорт Excel</button> : null}
            {config.primaryAction ? (
              mutation
                ? <button type="button" className="warehouse-primary-action" onClick={openDrawer}>{config.primaryAction}</button>
                : <button type="button" className="warehouse-primary-action" disabled title={WAREHOUSE_WRITE_UNAVAILABLE}>{config.primaryAction}</button>
            ) : null}
          </div>
        </header>

        {computedSummary ? (
          <div className="warehouse-summary-grid">
            {computedSummary.map((item) => (
              <article className={`warehouse-summary-card warehouse-summary-card--${item.tone}`} key={item.label}>
                <div>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
                <i><Icon name={item.icon} size={25} /></i>
              </article>
            ))}
          </div>
        ) : null}

        {config.tabs ? (
          <div className="warehouse-tabs">
            <button type="button" className={activeTab === ACTIVE ? "is-active" : ""} onClick={() => setActiveTab(ACTIVE)}>Активные</button>
            <button type="button" className={activeTab === ARCHIVE ? "is-active" : ""} disabled title={WAREHOUSE_WRITE_UNAVAILABLE}>Архив</button>
          </div>
        ) : null}

        <div className="warehouse-filters">
          <label className="warehouse-search-control">
            <span>Поиск</span>
            <input value={draftFilters.search} onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Документ, поставщик, товар..." />
          </label>
          {(config.filters || []).map(([key, label, placeholder]) => (
            <label key={key}>
              <span>{label}</span>
              <input value={draftFilters[key] || ""} onChange={(event) => setDraftFilters((current) => ({ ...current, [key]: event.target.value }))} placeholder={placeholder} />
            </label>
          ))}
          <div className="warehouse-filter-actions">
            <button type="button" onClick={() => setFilters(draftFilters)}><Icon name="bi-funnel" size={15} />Фильтровать</button>
            <button type="button" className="warehouse-clear-action" onClick={() => {
              const reset = { search: "", date: "01.06.2026 - 23.06.2026", warehouse: "", supplier: "", status: "", receiver: "", category: "", author: "", from: "", to: "" };
              setDraftFilters(reset);
              setFilters(reset);
            }}>Очистить</button>
          </div>
        </div>

        <div className="warehouse-table-wrapper">
          <table className="warehouse-table">
            <thead>
              <tr>{config.columns.map((column) => <th key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={`${row.id || row.document || row.product || row.name}-${index}`}>
                  {renderWarehouseCells(section, row, index, config.editable, { busyId, onAccept: handleAccept, onDelete: handleDelete })}
                </tr>
              ))}
              {!loading && !error && !visibleRows.length ? <tr><td className="warehouse-empty-cell" colSpan={config.columns.length}>Нет данных</td></tr> : null}
            </tbody>
          </table>
        </div>

        <footer className="warehouse-pagination">
          <span>Показано 1 - {Math.min(visibleRows.length, 10)} из {visibleRows.length}</span>
          <div>
            {[1, 2, 3, 4].map((page) => <button key={page} type="button" className={page === 1 ? "is-active" : ""}>{page}</button>)}
          </div>
          <select defaultValue="10"><option value="10">10 / стр.</option><option value="20">20 / стр.</option></select>
        </footer>
      </section>

      {drawerOpen ? (
        section === "outgoing" ? (
          <ExpenseDrawer
            warehouses={refData.warehouses}
            ingredients={refData.ingredients}
            saving={saving}
            error={saveError}
            onClose={() => { if (!saving) setDrawerOpen(false); }}
            onSubmit={handleCreate}
          />
        ) : section === "waste" ? (
          <WasteDrawer
            warehouses={refData.warehouses}
            ingredients={refData.ingredients}
            saving={saving}
            error={saveError}
            onClose={() => { if (!saving) setDrawerOpen(false); }}
            onSubmit={handleCreate}
          />
        ) : (
          <PurchaseDrawer
            warehouses={refData.warehouses}
            ingredients={refData.ingredients}
            saving={saving}
            error={saveError}
            onClose={() => { if (!saving) setDrawerOpen(false); }}
            onSubmit={handleCreate}
          />
        )
      ) : null}
    </div>
  );
}

function renderWarehouseCells(section, row, index, editable, ctx = {}) {
  const actions = editable ? (
    <td>
      <div className="warehouse-row-actions">
        <button type="button" className="edit-action-button" disabled title={WAREHOUSE_WRITE_UNAVAILABLE} aria-label="Редактирование недоступно"><Icon name="bi-pencil" size={15} /></button>
        <button type="button" className={row.archiveState === ARCHIVE ? "is-restore" : "is-danger"} disabled title={WAREHOUSE_WRITE_UNAVAILABLE} aria-label="Архивирование недоступно">
          <Icon name={row.archiveState === ARCHIVE ? "bi-recycle" : "bi-trash3"} size={15} />
        </button>
      </div>
    </td>
  ) : null;

  const status = row.status ? <span className={`warehouse-status-badge warehouse-status-badge--${statusTone(row.status)}`}>{row.status}</span> : null;

  // Живые действия по проводимому документу (приход/расход/отход): «Провести»
  // только для черновика + «Удалить». Кнопки блокируются на время мутации по
  // этой строке (busyId). Требует ctx.onAccept/onDelete из WarehousePage.
  const docActions = (acceptTitle, deleteTitle) => {
    const busy = ctx.busyId === row.id;
    return (
      <td>
        <div className="warehouse-row-actions">
          {!row.accepted ? (
            <button type="button" className="is-restore" disabled={busy} onClick={() => ctx.onAccept?.(row.id)} aria-label={acceptTitle} title={acceptTitle}><Icon name="bi-check2-circle" size={15} /></button>
          ) : null}
          <button type="button" className="is-danger" disabled={busy} onClick={() => ctx.onDelete?.(row.id)} aria-label={deleteTitle} title={deleteTitle}><Icon name="bi-trash3" size={15} /></button>
        </div>
      </td>
    );
  };

  if (section === "stock") return <><td>{row.product}</td><td>{row.category}</td><td>{row.warehouse}</td><td>{row.stock}</td><td>{row.minStock}</td><td>{row.unit}</td><td>{row.price}</td><td>{row.total}</td><td>{status}</td></>;
  if (section === "incoming") {
    // Живые действия по документу: «Провести» (только для черновика) и «Удалить».
    return <><td>{index + 1}</td><td>{row.document}</td><td>{row.supplier}</td><td>{row.warehouse}</td><td>{row.total}</td><td>{status}</td><td>{row.date}</td>{docActions("Провести приход", "Удалить приход")}</>;
  }
  if (section === "incoming-journal") return <><td>{row.date}</td><td>{row.document}</td><td>{row.supplier}</td><td>{row.warehouse}</td><td>{row.positions}</td><td>{row.total}</td><td>{status}</td><td>{row.author}</td></>;
  if (section === "transfer") return <><td>{index + 1}</td><td>{row.document}</td><td>{row.from}</td><td>{row.to}</td><td>{row.positions}</td><td>{row.total}</td><td>{status}</td><td>{row.date}</td>{actions}</>;
  if (section === "inventory") return <><td>{row.date}</td><td>{row.warehouse}</td><td>{row.checkType}</td><td>{row.comment}</td><td>{status}</td><td>{row.author}</td></>;
  if (section === "write-off") return <><td>{row.date}</td><td>{row.category}</td><td>{row.positions}</td><td>{status}</td><td>{row.author}</td><td>{row.note}</td></>;
  if (section === "write-off-categories") return <><td>{row.category}</td><td>{row.count}</td><td>{row.positions}</td></>;
  if (section === "waste") return <><td>{row.date}</td><td>{row.category}</td><td>{row.product}</td><td>{row.unit}</td><td>{row.quantity}</td><td>{row.total}</td><td>{row.author}</td><td>{row.reason}</td>{docActions("Провести отход", "Удалить отход")}</>;
  if (section === "outgoing") return <><td>{index + 1}</td><td>{row.document}</td><td>{row.receiver}</td><td>{row.warehouse}</td><td>{row.total}</td><td>{status}</td><td>{row.date}</td>{docActions("Провести расход", "Удалить расход")}</>;
  return <><td>{index + 1}</td><td>{row.document}</td><td>{row.supplier}</td><td>{row.warehouse}</td><td>{row.total}</td><td>{status}</td><td>{row.date}</td>{actions}</>;
}

export default WarehousePage;
