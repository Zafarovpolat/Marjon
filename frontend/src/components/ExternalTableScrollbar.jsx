import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// A native scrollbar in the card's padding, synchronised with the real table.
// The table keeps its clipping, sticky header, horizontal scroll and focus ring.
export default function ExternalTableScrollbar({ targetRef, label }) {
  const proxyRef = useRef(null);
  const [layout, setLayout] = useState(null);

  useLayoutEffect(() => {
    const target = targetRef.current;
    const parent = target?.closest(".dish-catalog-card");
    if (!target || !parent) return undefined;
    const syncToProxy = () => {
      const proxy = proxyRef.current;
      if (proxy && Math.abs(proxy.scrollTop - target.scrollTop) > 0.5) proxy.scrollTop = target.scrollTop;
    };
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
      syncToProxy();
    };
    update();
    // Scroll events only copy the offset: no layout reads or React state work
    // on the hot path. Geometry is measured solely on actual layout changes.
    target.addEventListener("scroll", syncToProxy, { passive: true });
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    [parent, target, target.firstElementChild].filter(Boolean).forEach((element) => observer?.observe(element));
    return () => {
      target.removeEventListener("scroll", syncToProxy);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [targetRef]);

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
      onScroll={(event) => {
        const target = targetRef.current;
        if (target && Math.abs(target.scrollTop - event.currentTarget.scrollTop) > 0.5) {
          target.scrollTop = event.currentTarget.scrollTop;
        }
      }}
    >
      <div aria-hidden="true" style={{ height: layout.contentHeight, width: 1 }} />
    </div>,
    layout.parent,
  );
}
