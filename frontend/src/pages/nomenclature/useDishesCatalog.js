// Вся кросс-секционная логика каталога блюд OWNER: загрузка, фильтры, форма,
// настройки колонок и мутации. Вынесено из NomenclaturePage.jsx (FE-07B)
// без ослабления FE-06 safety (AbortController/useLatestRequest, замки мутаций,
// stale-response ownership, unmount safety, числовой парсинг сохранены 1:1).
import { useEffect, useMemo, useRef, useState } from "react";
import { catalogService } from "../../api/catalog";
import { getCategories } from "../../api/categories";
import { settingsService } from "../../api/settings";
import { isAbortError, useLatestRequest, useMutationLocks } from "../../hooks/useAsyncSafety";
import { defaultDishColumnVisibility, dishColumnOptions, emptyDishForm } from "./nomenclatureConfig";
import {
  buildNomenclatureProductPayload,
  mapNomenclatureProduct,
  parseNomenclatureMoney,
  parseNomenclatureSort,
} from "./nomenclatureData";

// JPEG/PNG/WebP — как принимает POST /inventory/products/{id}/photo.
export const SUPPORTED_DISH_PHOTO_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"]);
// Опции фильтра «Категория»: ТОЛЬКО живой GET /inventory/categories
// (тот же источник, что у «Категория блюд»). Никаких демо/хардкод-фолбэков:
// пусто/ошибка → truthful disabled-состояние, без catch-all опции ([] = без
// ограничения). value = category.id, label = category.name; сопоставление со
// строками — по имени, т.к. продукты несут только category_name.
export function useDishesCatalog() {
  const [rows, setRows] = useState([]);
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  // V17 — категория: массив canonical IDs (мультиселект как в Reports).
  // [] = без ограничения (заменяет удалённую опцию «Все категории»).
  const [draftFilters, setDraftFilters] = useState({ search: "", category: [] });
  const [filters, setFilters] = useState(draftFilters);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const closeTimer = useRef(null);
  // Прямая загрузка фото из строки таблицы: один файл → один запрос.
  const [photoUploadingId, setPhotoUploadingId] = useState(null);
  // Фото для drawer: выбранный файл + временный ObjectURL-превью.
  // Превью — только UI, персистентность — только через uploadProductPhoto.
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const previewUrlRef = useRef("");

  const revokePhotoPreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    }
  };

  useEffect(() => () => {
    revokePhotoPreview();
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!SUPPORTED_DISH_PHOTO_TYPES.includes(file.type)) {
      setActionError("Поддерживаются только JPG, PNG и WebP.");
      return;
    }
    revokePhotoPreview();
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setPhotoFile(file);
    setPhotoPreview(url);
    setActionError("");
  };
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyDishForm });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(defaultDishColumnVisibility);
  // Добавки (модификаторы) редактируемого блюда: список групп, загрузка/ошибка.
  const [modGroups, setModGroups] = useState([]);
  const [modLoading, setModLoading] = useState(false);
  const [modError, setModError] = useState("");
  // Опции фильтра «Категория»: живые данные GET /inventory/categories
  // (тот же источник, что у «Категория блюд» — готово к будущему merge).
  // Пусто/ошибка → опций нет (только «Все категории»), никакой выдумки имён.
  const [filterCategories, setFilterCategories] = useState([]);
  const [filterCategoriesError, setFilterCategoriesError] = useState(false);
  const [filterCategoriesLoading, setFilterCategoriesLoading] = useState(true);
  // V18 — справочник принтеров из Настройки → Принтеры (тот же settingsService,
  // что у SettingsPrintersPage: GET /printers). Один запрос при монтировании,
  // не при каждом открытии дровера. Без фейков: ошибка → пусто + флаг.
  const [printerOptions, setPrinterOptions] = useState([]);
  const [printerOptionsLoading, setPrinterOptionsLoading] = useState(true);
  const [printerOptionsError, setPrinterOptionsError] = useState(false);
  const beginRequest = useLatestRequest();
  const beginFilterRequest = useLatestRequest();
  const beginPrinterRequest = useLatestRequest();
  const { acquire, release } = useMutationLocks();

  const visibleColumnKeys = useMemo(
    () => dishColumnOptions.filter((column) => visibleColumns[column.key] !== false).map((column) => column.key),
    [visibleColumns],
  );
  const tableMinWidth = useMemo(() => {
    const width = dishColumnOptions.reduce((sum, column) => (
      visibleColumns[column.key] !== false ? sum + column.width : sum
    ), 0);
    return Math.max(760, width);
  }, [visibleColumns]);
  const visibleColumnCount = visibleColumnKeys.length;
  const isColumnVisible = (key) => visibleColumns[key] !== false;
  const toggleColumn = (key) => {
    setVisibleColumns((current) => {
      const checked = current[key] !== false;
      if (checked && visibleColumnCount <= 1) return current;
      return { ...current, [key]: !checked };
    });
  };

  useEffect(() => {
    const request = beginRequest();
    setApiLoading(true);
    setApiError("");
    catalogService.listProducts({ signal: request.signal })
      .then(({ data }) => {
        if (!request.isCurrent()) return;
        const items = Array.isArray(data) ? data : data?.items || [];
        const mapped = items.map(mapNomenclatureProduct);
        setRows(mapped);
      })
      .catch((err) => {
        if (!request.isCurrent() || isAbortError(err)) return;
        setRows([]);
        setApiError(err.response?.data?.detail || "Не удалось загрузить каталог блюд.");
      })
      .finally(() => {
        if (request.isCurrent()) setApiLoading(false);
      });
  }, [beginRequest]);

  useEffect(() => {
    const request = beginFilterRequest();
    setFilterCategoriesError(false);
    setFilterCategoriesLoading(true);
    getCategories({ signal: request.signal })
      .then(({ data }) => {
        if (!request.isCurrent()) return;
        const items = Array.isArray(data) ? data : data?.items || [];
        const live = items
          .filter((item) => item && item.is_active !== false && String(item.name || "").trim())
          .sort((a, b) => (
            Number(a.sort_order || 0) - Number(b.sort_order || 0)
            || String(a.name).localeCompare(String(b.name), "ru")
          ))
          .map((item) => ({ id: String(item.id), name: String(item.name) }));
        setFilterCategories(live);
      })
      .catch((err) => {
        if (!request.isCurrent() || isAbortError(err)) return;
        setFilterCategories([]);
        setFilterCategoriesError(true);
      })
      .finally(() => {
        if (request.isCurrent()) setFilterCategoriesLoading(false);
      });
  }, [beginFilterRequest]);

  useEffect(() => {
    const request = beginPrinterRequest();
    setPrinterOptionsError(false);
    setPrinterOptionsLoading(true);
    settingsService.listResource("printers", { signal: request.signal })
      .then(({ data }) => {
        if (!request.isCurrent()) return;
        const items = Array.isArray(data) ? data : data?.items || [];
        const live = items
          .filter((item) => item && String(item.name || "").trim())
          .sort((a, b) => (
            Number(a.sort_order || 0) - Number(b.sort_order || 0)
            || String(a.name).localeCompare(String(b.name), "ru")
          ))
          .map((item) => ({
            id: String(item.id),
            name: String(item.name),
            active: item.is_active !== false,
          }));
        setPrinterOptions(live);
      })
      .catch((err) => {
        if (!request.isCurrent() || isAbortError(err)) return;
        setPrinterOptions([]);
        setPrinterOptionsError(true);
      })
      .finally(() => {
        if (request.isCurrent()) setPrinterOptionsLoading(false);
      });
  }, [beginPrinterRequest]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const searchMatch = !filters.search || row.name.toLowerCase().includes(filters.search.toLowerCase());
      // V17 — фильтр хранит массив category.id (OR-семантика); строки несут
      // только category_name — маппим через загруженный справочник. Пустой
      // массив = без ограничения. id без имени в справочнике игнорируем;
      // если не резолвится ни один — показываем всё (как раньше с протухшим
      // одиночным значением: пустой каталог хуже честного показа всех строк).
      const selectedIds = Array.isArray(filters.category) ? filters.category : [];
      const selectedNames = new Set(
        selectedIds
          .map((id) => filterCategories.find((item) => item.id === id)?.name)
          .filter(Boolean),
      );
      const categoryMatch = selectedIds.length === 0 || selectedNames.size === 0
        || selectedNames.has(row.category);
      return searchMatch && categoryMatch;
    });
  }, [rows, filters, filterCategories]);

  const updateRow = (id, key, value) => {
    void id;
    void key;
    void value;
    setActionError("Быстрое изменение недоступно: backend mutation contract не подключён.");
  };

  const openDrawer = (row = null) => {
    if (saving) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setDrawerClosing(false);
    setEditing(row);
    setForm(row || { ...emptyDishForm });
    revokePhotoPreview();
    setPhotoFile(null);
    setPhotoPreview("");
    setDrawerOpen(true);
    // Добавки существуют только у сохранённого блюда — подтягиваем их группы
    // при открытии редактирования; для нового блюда список пуст.
    setModGroups([]);
    setModError("");
    if (row?.id) loadModGroups(row.id);
  };

  // Закрытие через exit-анимацию staff-примитива (is-closing → unmount),
  // тот же presence-паттерн, что у кассира/аккаунт-меню.
  const requestCloseDrawer = () => {
    if (saving || !drawerOpen || drawerClosing) return;
    setDrawerClosing(true);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(finishCloseDrawer, 240);
  };

  const finishCloseDrawer = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setDrawerOpen(false);
    setDrawerClosing(false);
  };

  const saveDish = async () => {
    if (!acquire("product-save")) return;
    const isUpdate = Boolean(editing);
    setActionError("");
    const name = String(form.name || "").trim();
    const sortOrder = parseNomenclatureSort(form.sort);
    const price = parseNomenclatureMoney(form.price);
    const costInput = String(form.cost ?? "").trim();
    const costPrice = parseNomenclatureMoney(form.cost);
    if (!name || !Number.isInteger(sortOrder) || sortOrder < 1 || price === null || price < 0 || (costInput && costPrice === null) || (costPrice !== null && costPrice < 0)) {
      setActionError("Заполните название и укажите корректные неотрицательные цену, себестоимость и порядок сортировки.");
      release("product-save");
      return;
    }
    const payload = buildNomenclatureProductPayload(form, { isUpdate });
    setSaving(true);
    try {
      const { data } = isUpdate
        ? await catalogService.updateProduct(editing.id, payload)
        : await catalogService.createProduct(payload);
      if (!data?.id) throw new Error("Backend не вернул сохранённый продукт.");
      const serverRow = mapNomenclatureProduct(data);
      setRows((current) => (
        isUpdate
          ? current.map((row) => (row.id === editing.id ? serverRow : row))
          : [serverRow, ...current]
      ));
      // V20: созданный продукт сразу становится editing — повторное сохранение
      // (например ретрай фото после частичного успеха) идёт PATCH тем же ID,
      // дубль блюда не создаётся.
      if (!isUpdate) setEditing({ id: data.id });
      // Фото: продукт уже существует (свой id) — грузим через канонический
      // POST /inventory/products/{id}/photo. Превью до этого момента —
      // только временный ObjectURL, персистентностью не является.
      // V20: при ошибке загрузки файл НЕ сбрасываем — повторное сохранение
      // идёт тем же product ID через PATCH (без дубля), фото догружается.
      if (photoFile) {
        try {
          const { data: photoData } = await catalogService.uploadProductPhoto(data.id, photoFile);
          if (!photoData?.id) throw new Error("Backend не вернул продукт с фото.");
          const photoRow = mapNomenclatureProduct(photoData);
          setRows((current) => current.map((row) => (row.id === data.id ? photoRow : row)));
          revokePhotoPreview();
          setPhotoFile(null);
          setPhotoPreview("");
        } catch (photoErr) {
          const message = `Блюдо сохранено, но фото не загружено: ${photoErr.response?.data?.detail || photoErr.message || "ошибка загрузки"}`;
          setActionError(message);
          window.alert(message);
          return;
        }
      }
    } catch (err) {
      const message = err.response?.data?.detail || err.message || "Ошибка сохранения";
      setActionError(message);
      window.alert(message);
      return;
    } finally {
      setSaving(false);
      release("product-save");
    }
    setDrawerOpen(false);
  };

  const archiveDish = async (id) => {
    const lockKey = `product-delete:${id}`;
    if (!acquire(lockKey)) return;
    setPendingDeleteId(id);
    try {
      await catalogService.deleteProduct(id);
    } catch (err) {
      window.alert(err.response?.data?.detail || "Ошибка удаления");
      return;
    } finally {
      setPendingDeleteId(null);
      release(lockKey);
    }
    setRows((prev) => prev.filter((row) => row.id !== id));
  };

  // --- Добавки (модификаторы) --------------------------------------------------
  async function loadModGroups(productId) {
    setModLoading(true);
    setModError("");
    try {
      const { data } = await catalogService.listModifierGroups(productId);
      setModGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      setModError(err.response?.data?.detail || "Не удалось загрузить добавки.");
    } finally {
      setModLoading(false);
    }
  }

  // Сохранение группы: новая (без id) → create, существующая → update. После
  // ответа перезагружаем список, чтобы id новых опций пришли с сервера.
  async function saveModGroup(group) {
    if (!editing?.id) {
      setModError("Сначала сохраните блюдо, затем добавляйте добавки.");
      return;
    }
    const lockKey = `modgroup-save:${group.id || "new"}`;
    if (!acquire(lockKey)) return;
    setModError("");
    const modifiers = (group.modifiers || [])
      .map((m) => ({
        id: m.id || undefined,
        name: String(m.name || "").trim(),
        price_delta: Number(m.price_delta) || 0,
        is_default: Boolean(m.is_default),
        sort_order: Number(m.sort_order) || 0,
      }))
      .filter((m) => m.name);
    try {
      if (group.id) {
        await catalogService.updateModifierGroup(group.id, {
          name: String(group.name || "").trim(),
          min_select: Number(group.min_select) || 0,
          max_select: Math.max(1, Number(group.max_select) || 1),
          is_required: Boolean(group.is_required),
          show_in_pos: group.show_in_pos !== false,
          modifiers,
        });
      } else {
        await catalogService.createModifierGroup({
          product_id: editing.id,
          name: String(group.name || "").trim(),
          min_select: Number(group.min_select) || 0,
          max_select: Math.max(1, Number(group.max_select) || 1),
          is_required: Boolean(group.is_required),
          show_in_pos: group.show_in_pos !== false,
          modifiers,
        });
      }
      await loadModGroups(editing.id);
    } catch (err) {
      const message = err.response?.data?.detail || "Не удалось сохранить добавки.";
      setModError(message);
      window.alert(message);
    } finally {
      release(lockKey);
    }
  }

  async function removeModGroup(groupId) {
    if (!groupId) {
      // Несохранённая группа — просто убираем из локального списка.
      setModGroups((current) => current.filter((g) => g.id));
      return;
    }
    const lockKey = `modgroup-delete:${groupId}`;
    if (!acquire(lockKey)) return;
    try {
      await catalogService.deleteModifierGroup(groupId);
      setModGroups((current) => current.filter((g) => g.id !== groupId));
    } catch (err) {
      window.alert(err.response?.data?.detail || "Не удалось удалить добавки.");
    } finally {
      release(lockKey);
    }
  }

  // Прямая загрузка фото существующего блюда из строки таблицы:
  // файл → POST /inventory/products/{id}/photo → строка обновляется ответом
  // backend. Без оптимистичных URL и без смены id. Ошибка — честное сообщение,
  // превью в таблице нет (превью живёт только в дровере до upload).
  const uploadDishPhoto = async (id, file) => {
    if (!file || photoUploadingId) return;
    if (!SUPPORTED_DISH_PHOTO_TYPES.includes(file.type)) {
      setActionError("Поддерживаются только JPG, PNG и WebP.");
      return;
    }
    setPhotoUploadingId(id);
    setActionError("");
    try {
      const { data } = await catalogService.uploadProductPhoto(id, file);
      if (!data?.id) throw new Error("Backend не вернул продукт с фото.");
      const photoRow = mapNomenclatureProduct(data);
      setRows((current) => current.map((row) => (row.id === id ? photoRow : row)));
    } catch (err) {
      const message = `Фото не загружено: ${err.response?.data?.detail || err.message || "ошибка загрузки"}`;
      setActionError(message);
      window.alert(message);
    } finally {
      setPhotoUploadingId(null);
    }
  };

  return {
    apiLoading,
    apiError,
    actionError,
    saving,
    pendingDeleteId,
    draftFilters,
    setDraftFilters,
    setFilters,
    filterCategories,
    filterCategoriesError,
    filterCategoriesLoading,
    printerOptions,
    printerOptionsLoading,
    printerOptionsError,
    drawerOpen,
    setDrawerOpen,
    drawerClosing,
    requestCloseDrawer,
    finishCloseDrawer,
    photoUploadingId,
    uploadDishPhoto,
    editing,
    form,
    setForm,
    photoFile,
    photoPreview,
    handlePhotoChange,
    settingsOpen,
    setSettingsOpen,
    setVisibleColumns,
    tableMinWidth,
    visibleColumnCount,
    isColumnVisible,
    toggleColumn,
    filteredRows,
    updateRow,
    openDrawer,
    saveDish,
    archiveDish,
    // Добавки (модификаторы)
    modGroups,
    setModGroups,
    modLoading,
    modError,
    saveModGroup,
    removeModGroup,
  };
}


