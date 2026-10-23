import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// A native scrollbar in the card's padding, synchronised with the real table.
// The table keeps its clipping, sticky header, horizontal scroll and focus ring.
//
// PERF-01: обе стороны синхронизируются через requestAnimationFrame, а не прямо
// в обработчике scroll. Синхронная запись scrollTop «чужого» скроллера внутри
// события прокрутки заставляет браузер сбрасывать layout/paint в том же кадре,
// который двигает список: композитная прокрутка превращается в main-thread,
// содержимое начинает отставать от колеса и «притормаживать» к концу диапазона.
// С rAF обработчик только планирует работу, а запись делается один раз перед
// следующим пейнтом. Геометрия по-прежнему читается только на layout-изменениях.
// jsdom без pretendToBeVisual не даёт rAF — тогда кадром считаем macrotask,
// чтобы компонент оставался работоспособным в тестах.
const nextFrame = typeof requestAnimationFrame === "function"
  ? (callback) => requestAnimationFrame(callback)
  : (callback) => setTimeout(callback, 0);
const cancelFrame = typeof cancelAnimationFrame === "function"
  ? (id) => cancelAnimationFrame(id)
  : (id) => clearTimeout(id);

export default function ExternalTableScrollbar({ targetRef, label }) {
  const proxyRef = useRef(null);
  const [layout, setLayout] = useState(null);

  useLayoutEffect(() => {
    const target = targetRef.current;
    const parent = target?.closest(".dish-catalog-card");
    if (!target || !parent) return undefined;

    let frame = 0;
    const flush = () => {
      frame = 0;
      const proxy = proxyRef.current;
      const table = targetRef.current;
      if (!proxy || !table) return;
      if (Math.abs(proxy.scrollTop - table.scrollTop) > 0.5) proxy.scrollTop = table.scrollTop;
    };
    const schedule = () => { if (!frame) frame = nextFrame(flush); };

    const update = () => {
      const targetRect = target.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      const top = targetRect.top - parentRect.top - parent.clientTop;
      const left = targetRect.right - parentRect.left - parent.clientLeft + 3;
      const height = target.clientHeight;
      const contentHeight = target.scrollHeight;
      setLayout((previous) => previous?.parent === parent && previous.top === top
        && previous.left === left && previous.height === height && previous.contentHeight === contentHeight
        ? previous : { parent, top, left, height, contentHeight });
      // Layout already settled here: copy the offset without waiting a frame.
      const proxy = proxyRef.current;
      if (proxy && Math.abs(proxy.scrollTop - target.scrollTop) > 0.5) proxy.scrollTop = target.scrollTop;
    };
    update();
    // Scroll events only schedule one write per frame: no layout reads and no
    // React state work on the hot path.
    target.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    [parent, target, target.firstElementChild].filter(Boolean).forEach((element) => observer?.observe(element));
    return () => {
      if (frame) cancelFrame(frame);
      target.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [targetRef]);

  // The rail's own scroll (thumb drag / arrows / keyboard) is mirrored back to
  // the table through the same single write per frame.
  useLayoutEffect(() => {
    const proxy = proxyRef.current;
    if (!proxy) return undefined;
    let frame = 0;
    const flush = () => {
      frame = 0;
      const table = targetRef.current;
      if (table && Math.abs(table.scrollTop - proxy.scrollTop) > 0.5) table.scrollTop = proxy.scrollTop;
    };
    const schedule = () => { if (!frame) frame = nextFrame(flush); };
    proxy.addEventListener("scroll", schedule, { passive: true });
    return () => {
      if (frame) cancelFrame(frame);
      proxy.removeEventListener("scroll", schedule);
    };
  }, [layout, targetRef]);

  useLayoutEffect(() => {
    if (proxyRef.current && targetRef.current) proxyRef.current.scrollTop = targetRef.current.scrollTop;
  }, [layout, targetRef]);

  if (!layout || layout.height <= 0 || layout.contentHeight <= layout.height) return null;
  return createPortal(
    <div
      ref={proxyRef}
      className="catalog-external-scrollbar"
      role="region"
      aria-label={label}
      tabIndex={0}
      style={{ top: layout.top, left: layout.left, height: layout.height }}
    >
      <div aria-hidden="true" style={{ height: layout.contentHeight, width: 1 }} />
    </div>,
    layout.parent,
  );
}
