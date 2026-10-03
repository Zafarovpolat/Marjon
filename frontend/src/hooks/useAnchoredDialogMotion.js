import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const MOTION_DURATION_MS = 220;
const REDUCED_MOTION_DURATION_MS = 80;

const INITIAL_MOTION = {
  ready: false,
  closing: false,
  style: undefined,
};

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function useAnchoredDialogMotion({
  isOpen,
  onClose,
  motionMode = "anchored",
  sourceRect,
  returnFocusRef,
}) {
  const dialogRef = useRef(null);
  const closeTimerRef = useRef(null);
  const closingRef = useRef(false);
  const [motion, setMotion] = useState(INITIAL_MOTION);

  const finishClose = useCallback(() => {
    if (!closingRef.current) return;

    closingRef.current = false;
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    onClose();
    const restoreFocus = () => {
      const trigger = returnFocusRef?.current;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(restoreFocus);
    } else {
      restoreFocus();
    }
  }, [onClose, returnFocusRef]);

  const requestClose = useCallback(() => {
    if (!isOpen || closingRef.current) return;

    closingRef.current = true;
    setMotion((current) => ({ ...current, ready: true, closing: true }));
    const duration = prefersReducedMotion() ? REDUCED_MOTION_DURATION_MS : MOTION_DURATION_MS;
    closeTimerRef.current = window.setTimeout(finishClose, duration + 40);
  }, [finishClose, isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !dialogRef.current) {
      closingRef.current = false;
      setMotion(INITIAL_MOTION);
      return undefined;
    }

    const targetRect = dialogRef.current.getBoundingClientRect();
    const isAnchored = motionMode === "anchored";
    const sourceCenterX = isAnchored && sourceRect ? sourceRect.left + sourceRect.width / 2 : targetRect.left + targetRect.width / 2;
    const sourceCenterY = isAnchored && sourceRect ? sourceRect.top + sourceRect.height / 2 : targetRect.top + targetRect.height / 2;
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;

    setMotion({
      ready: true,
      closing: false,
      style: {
        "--owner-modal-shift-x": isAnchored ? `${sourceCenterX - targetCenterX}px` : "0px",
        "--owner-modal-shift-y": isAnchored ? `${sourceCenterY - targetCenterY}px` : "8px",
        "--owner-modal-source-scale": isAnchored ? 0.6 : 0.88,
        "--owner-modal-close-scale": 0.9,
        "--owner-modal-origin-x": isAnchored ? `${clamp(sourceCenterX - targetRect.left, 0, targetRect.width)}px` : "50%",
        "--owner-modal-origin-y": isAnchored ? `${clamp(sourceCenterY - targetRect.top, 0, targetRect.height)}px` : "50%",
      },
    });

    return undefined;
  }, [isOpen, motionMode, sourceRect]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, requestClose]);

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
  }, []);

  const handleAnimationEnd = useCallback((event) => {
    if (event.target === event.currentTarget && closingRef.current) finishClose();
  }, [finishClose]);

  return {
    dialogRef,
    motionClassName: [
      "owner-modal-motion",
      `owner-modal-motion--${motionMode}`,
      motion.ready ? "is-motion-ready" : "",
      motion.closing ? "is-motion-closing" : "",
    ].filter(Boolean).join(" "),
    motionStyle: motion.style,
    requestClose,
    handleAnimationEnd,
  };
}
