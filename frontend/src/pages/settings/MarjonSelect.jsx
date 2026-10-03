import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../../components/Icon";

// Compact OWNER custom select (chevron + rotate-on-open + animated menu),
// reusing the accepted `settings-select` design-system classes. Extracted
// verbatim from SettingsPaymentMethodsPage.jsx (behavior-identical) so the
// Clients Add/Edit status field reuses the ACTUAL shared primitive instead of
// a native <select> or a lookalike. Keyboard + outside-click aware.
//
// `floating` (opt-in, default false): renders the menu as a fixed overlay
// popover portaled to document.body — same approach as the Clients phone
// country popover — for compact centered modals whose overflow would clip an
// in-flow absolute menu. Same classes/visuals; only mount + position change.
// Payment Methods keeps floating=false: byte-identical rendering there.
export default function MarjonSelect({
  id,
  value,
  options,
  placeholder,
  label,
  onChange,
  floating = false,
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;
  const portalTarget = typeof document !== "undefined" ? document.body : null;

  const updateMenuPos = () => {
    const anchor = triggerRef.current;
    if (!anchor || typeof window === "undefined") return;
    const rect = anchor.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      setMenuPos({ width: Math.min(320, window.innerWidth - 16), left: 8, top: 8 });
      return;
    }
    const w = rect.width || Math.min(320, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
    const maxH = 240;
    const below = window.innerHeight - rect.bottom - 12;
    const flip = below < 140 && rect.top > below;
    setMenuPos({
      width: w,
      left,
      top: flip ? Math.max(8, rect.top - maxH - 6) : rect.bottom + 6,
    });
  };

  // Positioning + listeners run in useLayoutEffect (BEFORE paint): the
  // floating menu mounts directly at final coordinates — never a visible
  // frame at default coords, never a relocate jump (V18 no-flash rule).
  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return undefined;
    }
    if (floating) updateMenuPos();
    const onDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onResize = () => { if (floating) updateMenuPos(); };
    const onScroll = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      if (floating) updateMenuPos();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onResize);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open, floating]);

  const openMenu = (index = selectedIndex >= 0 ? selectedIndex : 0) => { setActiveIndex(index); setOpen(true); };
  const commit = (index) => {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") { if (open) { event.preventDefault(); event.stopPropagation(); setOpen(false); } return; }
    if (event.key === "Tab") { setOpen(false); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) { openMenu(); return; }
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
      if (!open) { openMenu(); return; }
      commit(activeIndex);
    }
  };

  const listId = `${id}-listbox`;
  const menu = open ? (
    <ul
      className="settings-select__menu"
      ref={menuRef}
      id={listId}
      role="listbox"
      aria-label={label}
      {...(floating && menuPos
        ? { style: { position: "fixed", top: menuPos.top, left: menuPos.left, width: menuPos.width, right: "auto", zIndex: 10001 } }
        : {})}
    >
      {options.map((option, index) => {
        const isSelected = option.value === value;
        return (
          <li key={option.value}>
            <button
              type="button"
              id={`${id}-opt-${index}`}
              role="option"
              aria-selected={isSelected}
              className={`settings-select__option${isSelected ? " is-selected" : ""}${index === activeIndex ? " is-active" : ""}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => commit(index)}
            >
              <span>{option.label}</span>
              {isSelected ? <Icon name="bi-check2" size={14} /> : null}
            </button>
          </li>
        );
      })}
    </ul>
  ) : null;

  return (
    <div className={`settings-select${open ? " is-open" : ""}`} ref={rootRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className={`settings-select__trigger${selected ? "" : " is-placeholder"}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <span className="settings-select__value">{selected ? selected.label : placeholder}</span>
      </button>
      <span className="settings-select__chevron" aria-hidden="true"><Icon name="bi-chevron-down" size={15} /></span>
      {floating
        // Floating mode never mounts the menu in-flow (one frame of clipped
        // content would flash before positioning): it appears only once
        // coordinates exist, directly in the portal. The nested scope-marker
        // wrapper re-enables the shared option/hover/selected/animation
        // rules: the portal branch is written as
        // `.settings-owner-view .settings-select__portal …` (strict
        // descendant combinators), so BOTH markers must be present as
        // NESTED ancestors — one div carrying both classes would never match.
        ? (open && menuPos && portalTarget
          ? createPortal(
            <div className="settings-owner-view clients-modal-layer">
              <div className="settings-select__portal">
                {menu}
              </div>
            </div>,
            portalTarget,
          )
          : null)
        : menu}
    </div>
  );
}
