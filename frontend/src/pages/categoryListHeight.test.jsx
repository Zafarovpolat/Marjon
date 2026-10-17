import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { categoryListAvailableHeight, useCategoryListHeight } from "./categoryListHeight";
import { readFileSync } from "node:fs";

let content, card, list, observerCallback;
const disconnect = vi.fn();
const observe = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("innerHeight", 900);
  vi.stubGlobal("visualViewport", undefined);
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback) { observerCallback = callback; }
    observe = observe;
    disconnect = disconnect;
  });
  content = document.createElement("main");
  content.className = "dashboard-content";
  content.style.cssText = "padding:0 0 42px;margin:0;border:0";
  card = document.createElement("div");
  card.className = "menu-categories-card";
  card.style.cssText = "padding:0 0 22px;margin:0;border:0;border-bottom:1px solid";
  card.appendChild(document.createElement("header"));
  list = document.createElement("div");
  list.getBoundingClientRect = () => ({ top: 190 });
  card.appendChild(list);
  content.appendChild(card);
  document.body.appendChild(content);
});
afterEach(() => { content.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("category list available viewport height", () => {
  it("uses viewport minus list top, card border/padding and existing workspace gap", () => {
    expect(categoryListAvailableHeight(list)).toBe(645);
  });
  it("has no 560px ceiling on a tall viewport", () => {
    vi.stubGlobal("innerHeight", 1194);
    expect(categoryListAvailableHeight(list)).toBe(939);
  });
  it("uses the visual viewport during mobile keyboard/zoom", () => {
    vi.stubGlobal("visualViewport", { offsetTop: 100, height: 500 });
    expect(categoryListAvailableHeight(list)).toBe(345);
  });
  it("does not increase the cap when an ancestor scrolls", () => {
    content.scrollTop = 100;
    list.getBoundingClientRect = () => ({ top: 90 });
    expect(categoryListAvailableHeight(list)).toBe(645);
  });
  it("counts wrapper bottom spacing", () => {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "padding:0 0 3px;margin:0 0 4px;border:0";
    card.appendChild(wrapper);
    wrapper.appendChild(list);
    expect(categoryListAvailableHeight(list)).toBe(638);
  });
  it("never returns a negative height", () => {
    vi.stubGlobal("innerHeight", 200);
    expect(categoryListAvailableHeight(list)).toBe(0);
  });
  it("does not measure unrelated pages", () => {
    expect(categoryListAvailableHeight(document.createElement("div"))).toBeNull();
    renderHook(() => useCategoryListHeight({ current: list }, false, "semi"));
    expect(list.style.getPropertyValue("--category-list-available-height")).toBe("");
    expect(observe).not.toHaveBeenCalled();
  });
  it("measures before paint and refreshes on resize/observer updates without React render loops", () => {
    const ref = { current: list };
    renderHook(() => useCategoryListHeight(ref, true, "active"));
    expect(list.style.getPropertyValue("--category-list-available-height")).toBe("645px");
    vi.stubGlobal("innerHeight", 768);
    act(() => window.dispatchEvent(new Event("resize")));
    expect(list.style.getPropertyValue("--category-list-available-height")).toBe("513px");
    list.getBoundingClientRect = () => ({ top: 220 });
    act(() => observerCallback());
    expect(list.style.getPropertyValue("--category-list-available-height")).toBe("483px");
  });
  it("recalculates for tab/loading changes and disconnects listeners on unmount", () => {
    const ref = { current: list };
    const remove = vi.spyOn(window, "removeEventListener");
    const view = renderHook(({ key }) => useCategoryListHeight(ref, true, key), { initialProps: { key: "loading" } });
    list.getBoundingClientRect = () => ({ top: 210 });
    view.rerender({ key: "archived" });
    expect(list.style.getPropertyValue("--category-list-available-height")).toBe("625px");
    expect(disconnect).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
  });
  it("cleans up visual viewport listeners", () => {
    const viewport = { offsetTop: 0, height: 600, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal("visualViewport", viewport);
    const view = renderHook(() => useCategoryListHeight({ current: list }, true, "active"));
    expect(viewport.addEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    view.unmount();
    expect(viewport.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(viewport.removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
  });
  it("keeps lists shrink-wrapped and scrollable with no artificial cap or visible scrollbar", () => {
    const css = readFileSync("src/styles/owner/raw-categories.css", "utf8");
    expect(css).not.toMatch(/min\(60vh,\s*560px\)/);
    expect(css.match(/max-height: var\(--category-list-available-height, 100dvh\)/g)).toHaveLength(2);
    expect(css).toMatch(/\.rawcat-row\s*\{\s*flex-shrink:\s*0/);
    expect(css).toMatch(/\.dishcat-list:has\(> \.menu-category-empty\)\s*\{\s*max-height:\s*none/);
    expect(css).toContain("scrollbar-width: none");
    expect(css).toContain(".rawcat-list::-webkit-scrollbar");
    expect(css).toContain(".dishcat-list::-webkit-scrollbar");
    expect(css).not.toContain("!important");
  });
});
