import { useLayoutEffect } from "react";

const HEIGHT_PROPERTY = "--category-list-available-height";
const pixels = (value) => Number.parseFloat(value) || 0;

// The limit belongs to the row list, not the card. Reading existing padding
// keeps the approved desktop/mobile breathing space without another vh cap.
export function categoryListAvailableHeight(list) {
  const card = list.closest(".menu-categories-card");
  const content = list.closest(".dashboard-content");
  if (!card) return null;
  const viewport = window.visualViewport;
  const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
  let top = list.getBoundingClientRect().top;
  // Parent scrolling must not increase the cap (and cause a feedback loop).
  for (let parent = list.parentElement; parent; parent = parent.parentElement) {
    top += parent.scrollTop;
  }
  let inset = 0;
  for (let parent = list.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    inset += pixels(style.paddingBottom) + pixels(style.borderBottomWidth);
    if (parent !== content) inset += pixels(style.marginBottom);
    if (parent === content || (!content && parent === card)) break;
  }
  return Math.max(0, Math.floor(bottom - top - inset));
}

export function useCategoryListHeight(listRef, enabled, layoutKey) {
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!enabled || !list) return undefined;
    const update = () => {
      const height = categoryListAvailableHeight(list);
      if (height === null) return;
      const value = `${height}px`;
      if (list.style.getPropertyValue(HEIGHT_PROPERTY) !== value) {
        list.style.setProperty(HEIGHT_PROPERTY, value);
      }
    };
    // Before paint, including the loading → data and Active/Archived renders.
    update();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    const card = list.closest(".menu-categories-card");
    const content = list.closest(".dashboard-content");
    const topbar = list.closest(".dashboard-main")?.querySelector(".dashboard-topbar");
    [card, content, card?.querySelector("header"), topbar].filter(Boolean)
      .forEach((element) => observer?.observe(element));
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    document.fonts?.addEventListener("loadingdone", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      document.fonts?.removeEventListener("loadingdone", update);
    };
  }, [listRef, enabled, layoutKey]);
}
