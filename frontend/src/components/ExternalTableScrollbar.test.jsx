import { useRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExternalTableScrollbar from "./ExternalTableScrollbar";

afterEach(cleanup);

function Harness({ height = 100, contentHeight = 500 }) {
  const ref = useRef(null);
  return <div className="dish-catalog-card" ref={(node) => {
    if (node) node.getBoundingClientRect = vi.fn(() => ({ top: 50, left: 20 }));
  }}>
    <div className="dish-grid-wrap">
      <div data-testid="table-scroll" ref={(node) => {
        ref.current = node;
        if (!node) return;
        Object.defineProperties(node, {
          clientHeight: { value: height, configurable: true },
          scrollHeight: { value: contentHeight, configurable: true },
        });
        node.getBoundingClientRect = vi.fn(() => ({ top: 150, right: 600 }));
      }}><table><tbody><tr><td>Блюдо</td></tr></tbody></table></div>
    </div>
    <ExternalTableScrollbar targetRef={ref} label="Прокрутка блюд" />
  </div>;
}

describe("External table scrollbar", () => {
  it("portals the rail into the card, outside the clipped table", () => {
    render(<Harness />);
    act(() => window.dispatchEvent(new Event("resize")));
    const rail = screen.getByRole("region", { name: "Прокрутка блюд" });
    expect(rail.parentElement).toHaveClass("dish-catalog-card");
    expect(rail.closest(".dish-grid-wrap")).toBeNull();
    expect(rail).toHaveStyle({ top: "100px", height: "100px" });
    expect(rail).toHaveStyle({ left: "583px" });
    expect(rail.firstElementChild).toHaveStyle({ height: "500px" });
  });

  it("synchronizes table wheel/keyboard scrolling and external thumb/arrow scrolling", () => {
    render(<Harness />);
    const rail = screen.getByRole("region", { name: "Прокрутка блюд" });
    const table = screen.getByTestId("table-scroll");
    const geometryReads = table.getBoundingClientRect.mock.calls.length;
    const parentReads = rail.parentElement.getBoundingClientRect.mock.calls.length;
    rail.scrollTop = 120;
    fireEvent.scroll(rail);
    expect(table.scrollTop).toBe(120);
    table.scrollTop = 210;
    fireEvent.scroll(table);
    expect(rail.scrollTop).toBe(210);
    expect(table.getBoundingClientRect).toHaveBeenCalledTimes(geometryReads);
    expect(rail.parentElement.getBoundingClientRect).toHaveBeenCalledTimes(parentReads);
  });

  it("hides the external control for a short or empty table", () => {
    render(<Harness contentHeight={100} />);
    expect(screen.queryByRole("region", { name: "Прокрутка блюд" })).toBeNull();
  });

  it("remeasures the rail on viewport resize and removes it if overflow disappears", () => {
    render(<Harness />);
    const table = screen.getByTestId("table-scroll");
    Object.defineProperty(table, "clientHeight", { value: 500, configurable: true });
    act(() => window.dispatchEvent(new Event("resize")));
    expect(screen.queryByRole("region", { name: "Прокрутка блюд" })).toBeNull();
  });
});
