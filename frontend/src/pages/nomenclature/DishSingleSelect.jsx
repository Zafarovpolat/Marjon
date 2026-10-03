import { useEffect, useRef, useState } from "react";
import Icon from "../../components/Icon";

// Одиночный dropdown формы блюда (V18): Категория / Принтер.
// Та же визуальная семья, что фильтр каталога и Reports (триггер
// orders-filter-select__*, панель orders-filter-select__panel, exit-анимация
// через is-closing + onAnimationEnd, клавиатура Escape/Enter/Space/стрелки,
// закрытие по outside-click). Отличия от фильтра-мультиселекта: одиночный
// выбор canonical ID (пусто = null, плейсхолдер вместо catch-all опции),
// клик сразу фиксирует значение и закрывает панель.
export default function DishSingleSelect({
  label = "",
  placeholder = "",
  options = [],
  value = "",
  onChange,
  disabled = false,
  loading = false,
  disabledLabel = "",
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listId = `dish-form-${String(label).toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "-")}-menu`;
  const selected = (options || []).find((item) => item.value === value) || null;
  const shownPlaceholder = loading ? "Загрузка…" : (disabled && disabledLabel ? disabledLabel : placeholder);

  useEffect(() => {
    if (open) setActiveIndex(-1);
  }, [open ]);

  useEffect(() => {
    if (!open) return undefined;
    function onDown(event) {
      if (!rootRef.current?.contains(event.target)) requestClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  });

  function requestClose() {
    if (!open || closing) return;
    setClosing(true);
  }

  function handlePanelAnimationEnd(event) {
    if (closing && event.target === event.currentTarget) {
      setOpen(false);
      setClosing(false);
    }
  }

  function pick(nextValue) {
    if (disabled || loading) return;
    onChange(nextValue);
    requestClose();
  }

  function onKeyDown(event) {
    if (disabled || loading) return;
    if (event.key === "Escape") {
      if (open) { event.preventDefault(); event.stopPropagation(); requestClose(); triggerRef.current?.focus(); }
      return;
    }
    if (event.key === "Tab") { if (open) requestClose(); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((i) => {
        const next = i + step;
        if (next < 0) return options.length - 1;
        if (next >= options.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      if (activeIndex >= 0 && options[activeIndex]) pick(options[activeIndex].value);
    }
  }

  return (
    <div className={`orders-filter-select${open ? " is-open" : ""}`} ref={rootRef} onKeyDown={onKeyDown}>      <button
        type="button"
        ref={triggerRef}
        className={`orders-filter-select__trigger${selected ? "" : " is-placeholder"}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined}
        aria-label={label}
        title={disabled || loading ? shownPlaceholder : (selected?.label || undefined)}
        disabled={disabled || loading}
        onClick={() => (open ? requestClose() : setOpen(true))}
      >
        <span className="orders-filter-select__value">{selected ? selected.label : shownPlaceholder}</span>
        <span className="orders-filter-select__chevron" aria-hidden="true"><Icon name="bi-chevron-down" size={16} /></span>
      </button>
      {open || closing ? (
        <div
          className={`orders-filter-select__panel${closing ? " is-closing" : ""}`}
          aria-hidden={closing ? true : undefined}
          {...(closing ? { inert: true } : {})}
          onAnimationEnd={handlePanelAnimationEnd}
        >
          <ul className="orders-filter-select__menu" id={listId} role="listbox" aria-label={label}>
            {options.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    id={`${listId}-opt-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    className={`orders-filter-select__option${isSelected ? " is-selected" : ""}${index === activeIndex ? " is-active" : ""}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => pick(option.value)}
                  >
                    <span className="orders-filter-select__option-label">{option.label}</span>
                    {isSelected ? <Icon name="bi-check2" size={14} /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
