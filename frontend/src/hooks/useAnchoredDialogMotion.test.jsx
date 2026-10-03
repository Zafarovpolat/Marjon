import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAnchoredDialogMotion } from "./useAnchoredDialogMotion";

const SOURCE_RECT = {
  left: 80,
  top: 60,
  width: 180,
  height: 120,
};

function MotionHarness({ onClose, motionMode = "anchored" }) {
  const triggerRef = useRef(null);
  const {
    dialogRef,
    motionClassName,
    motionStyle,
    requestClose,
    handleAnimationEnd,
  } = useAnchoredDialogMotion({
    isOpen: true,
    onClose,
    motionMode,
    sourceRect: motionMode === "anchored" ? SOURCE_RECT : undefined,
    returnFocusRef: triggerRef,
  });

  return (
    <>
      <button ref={triggerRef} type="button">Source</button>
      <div
        className={motionClassName}
        data-testid="backdrop"
        style={motionStyle}
        onMouseDown={requestClose}
        onAnimationEnd={handleAnimationEnd}
      >
        <section ref={dialogRef} role="dialog" />
      </div>
    </>
  );
}

describe("useAnchoredDialogMotion", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sets source geometry and retains the dialog through its closing animation", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<MotionHarness onClose={onClose} />);

    const backdrop = screen.getByTestId("backdrop");
    expect(backdrop).toHaveClass("is-motion-ready");
    expect(backdrop).toHaveClass("owner-modal-motion--anchored");
    expect(backdrop.style.getPropertyValue("--owner-modal-shift-x")).not.toBe("");
    expect(backdrop.style.getPropertyValue("--owner-modal-source-scale")).toBe("0.6");

    fireEvent.mouseDown(backdrop);
    expect(backdrop).toHaveClass("is-motion-closing");
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(260);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses the same retained close path for Escape", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<MotionHarness onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    const backdrop = screen.getByTestId("backdrop");
    expect(backdrop).toHaveClass("is-motion-closing");
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(260);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses centered scale motion without a source-rect translation", () => {
    const onClose = vi.fn();
    render(<MotionHarness motionMode="centered" onClose={onClose} />);

    const backdrop = screen.getByTestId("backdrop");
    expect(backdrop).toHaveClass("owner-modal-motion--centered");
    expect(backdrop.style.getPropertyValue("--owner-modal-shift-x")).toBe("0px");
    expect(backdrop.style.getPropertyValue("--owner-modal-shift-y")).toBe("8px");
    expect(backdrop.style.getPropertyValue("--owner-modal-source-scale")).toBe("0.88");
    expect(backdrop.style.getPropertyValue("--owner-modal-origin-x")).toBe("50%");
  });

  it("keeps a short retained fade for reduced motion", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const onClose = vi.fn();
    render(<MotionHarness onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    vi.advanceTimersByTime(119);
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
