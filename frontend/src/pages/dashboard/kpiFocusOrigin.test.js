import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareKpiDialogTrigger } from "./kpiFocusOrigin";

function createFocusedTrigger() {
  const trigger = document.createElement("button");
  trigger.className = "kpi-card premium-kpi premium-kpi--avg";
  document.body.append(trigger);
  trigger.focus();
  return trigger;
}

describe("Dashboard KPI dialog focus origin", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("drops pointer focus and skips trigger restoration", () => {
    const trigger = createFocusedTrigger();
    const returnFocusRef = { current: trigger };
    const sourceRect = { left: 10, top: 20, width: 200, height: 120 };
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(sourceRect);

    expect(prepareKpiDialogTrigger({ detail: 1, currentTarget: trigger }, returnFocusRef)).toBe(sourceRect);
    expect(returnFocusRef.current).toBeNull();
    expect(document.activeElement).not.toBe(trigger);
  });

  it("preserves keyboard focus restoration for Enter/Space activation", () => {
    const trigger = createFocusedTrigger();
    const returnFocusRef = { current: null };

    prepareKpiDialogTrigger({ detail: 0, currentTarget: trigger }, returnFocusRef);

    expect(returnFocusRef.current).toBe(trigger);
    expect(document.activeElement).toBe(trigger);
  });
});
