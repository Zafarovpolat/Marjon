import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DishSingleSelect from "./DishSingleSelect";

vi.mock("../../components/Icon", () => ({ default: () => <span aria-hidden="true" /> }));
afterEach(cleanup);

function setup() {
  const onParentWheel = vi.fn();
  render(<div onWheel={onParentWheel}>
    <DishSingleSelect label="Сырьё" options={[{ value: "a", label: "Мясо" }]} onChange={vi.fn()} />
  </div>);
  fireEvent.click(screen.getByRole("combobox", { name: "Сырьё" }));
  const menu = screen.getByRole("listbox", { name: "Сырьё" });
  Object.defineProperties(menu, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: 400 },
    clientWidth: { configurable: true, value: 200 },
    scrollWidth: { configurable: true, value: 200 },
  });
  return { menu, onParentWheel };
}

function wheel(menu, options) {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...options });
  fireEvent(menu, event);
  return event;
}

describe("Dropdown scroll stays inside its list", () => {
  it("preserves native scrolling in the middle without bubbling to the parent", () => {
    const { menu, onParentWheel } = setup();
    menu.scrollTop = 100;
    expect(wheel(menu, { deltaY: 40 }).defaultPrevented).toBe(false);
    expect(onParentWheel).not.toHaveBeenCalled();
  });

  it("consumes vertical scrolling at both list boundaries", () => {
    const { menu, onParentWheel } = setup();
    menu.scrollTop = 0;
    expect(wheel(menu, { deltaY: -40 }).defaultPrevented).toBe(true);
    menu.scrollTop = 300;
    expect(wheel(menu, { deltaY: 40 }).defaultPrevented).toBe(true);
    expect(onParentWheel).not.toHaveBeenCalled();
  });

  it("does not scroll the table when the list is too short to scroll", () => {
    const { menu, onParentWheel } = setup();
    Object.defineProperty(menu, "scrollHeight", { configurable: true, value: 100 });
    expect(wheel(menu, { deltaY: 40 }).defaultPrevented).toBe(true);
    expect(wheel(menu, { deltaX: 40 }).defaultPrevented).toBe(true);
    expect(wheel(menu, { deltaY: 40, shiftKey: true }).defaultPrevented).toBe(true);
    expect(onParentWheel).not.toHaveBeenCalled();
  });

  it("preserves Ctrl+wheel browser zoom", () => {
    const { menu } = setup();
    expect(wheel(menu, { deltaY: 40, ctrlKey: true }).defaultPrevented).toBe(false);
  });
});
