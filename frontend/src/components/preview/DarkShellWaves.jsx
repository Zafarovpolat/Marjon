import { useId, useLayoutEffect, useRef } from "react";

// Keep the accepted lower decoration's coordinates and paint sequence intact.
const lowerSidebarPaths = Array.from({ length: 34 }, (_, index) => {
  const start = 520 + index * 14;
  const end = 780 + index * 8;
  return `M -40 ${start} C 90 ${start - 50} 154 ${end - 80} 340 ${end}`;
});

const compactContours = 20;
// One global arc, viewed through two shell-only clipping windows. The middle
// stays behind the light workspace and reappears in the right of the topbar.
const upperEdge = [-40, 145, 20, 223, 150, 290, 300, 266, 506, 263, 546, 170, 650, 70, 726, 22, 824, 8, 980, -12];
const lowerEdge = [-40, 363, 65, 360, 170, 420, 300, 382, 514, 345, 700, 198, 936, 116, 1075, 82, 1145, 20, 1300, -12];
const upperWavePaths = Array.from({ length: compactContours }, (_, index) => {
  const t = index / (compactContours - 1);
  const points = upperEdge.map((value, position) => value + (lowerEdge[position] - value) * t);
  return `M ${points.slice(0, 2).join(" ")} C ${points.slice(2, 8).join(" ")} C ${points.slice(8, 14).join(" ")} C ${points.slice(14).join(" ")}`;
});

function useWaveViewport(sidebar) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const host = sidebar ? document.getElementById("dashboardSidebar") : document.querySelector(".dashboard-topbar");
    const shell = host?.closest(".dashboard-shell");
    if (!shell) return undefined;
    const measure = () => {
      const bounds = shell.getBoundingClientRect();
      if (bounds.width <= 0 || !ref.current) return;
      const left = bounds.left - host.getBoundingClientRect().left;
      // Presentation-only coordinates are applied before paint, without a
      // deferred React render lagging behind the rail's collapse animation.
      ref.current.style.setProperty("--dark-shell-upper-wave-width", `${bounds.width}px`);
      ref.current.style.setProperty("--dark-shell-upper-wave-left", `${left}px`);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(shell);
    observer?.observe(host);
    const rail = document.getElementById("dashboardSidebar");
    if (rail && rail !== host) observer?.observe(rail);
    if (!observer) window.addEventListener("resize", measure);

    // DashboardLayout adds the body scope in its parent layout effect, after
    // this child effect. That can move the main via margin-left without any
    // size change, which ResizeObserver alone cannot see.
    const main = host.closest(".dashboard-main");
    const movingProperties = new Set(["margin-left", "left", "transform"]);
    const activeTransitions = new Set();
    let frame = null;
    const tick = () => {
      frame = null;
      measure();
      if (activeTransitions.size) frame = requestAnimationFrame(tick);
    };
    const queue = () => {
      if (frame === null) frame = requestAnimationFrame(tick);
    };
    const followsPosition = (event) => event.target === main && movingProperties.has(event.propertyName);
    const onTransitionRun = (event) => {
      if (!followsPosition(event)) return;
      activeTransitions.add(event.propertyName);
      queue();
    };
    const onTransitionEnd = (event) => {
      if (!followsPosition(event)) return;
      activeTransitions.delete(event.propertyName);
      measure();
      if (!activeTransitions.size && frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
    };
    main?.addEventListener("transitionrun", onTransitionRun);
    main?.addEventListener("transitionend", onTransitionEnd);
    main?.addEventListener("transitioncancel", onTransitionEnd);
    // Also remeasure after the parent effect when motion is disabled.
    queue();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      main?.removeEventListener("transitionrun", onTransitionRun);
      main?.removeEventListener("transitionend", onTransitionEnd);
      main?.removeEventListener("transitioncancel", onTransitionEnd);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [sidebar]);
  return ref;
}

function lineTone(index, sidebar) {
  // Previously the accepted bottom fan started after twelve upper contours.
  // Keep that exact palette offset even when the upper contour count changes.
  if (sidebar) index = (index < compactContours ? index : index - compactContours) + 12;
  else index += 12;
  if (index % 9 === 4) return "accent";
  return index % 3 === 0 ? "soft" : "main";
}

export default function DarkShellWaves({ variant }) {
  const fadeId = `marjon-wave-${useId().replace(/:/g, "")}`;
  const sidebar = variant === "sidebar";
  const waveRef = useWaveViewport(sidebar);
  const waveStyle = {
    "--dark-shell-upper-wave-width": "1535px",
    "--dark-shell-upper-wave-left": sidebar ? "0px" : "-280px",
  };
  return (
    <div className={`marjon-shell-wave-layer marjon-shell-wave-layer--${variant}`} aria-hidden="true">
      <svg
        className={`marjon-shell-wave marjon-shell-wave--${sidebar ? "sidebar-upper" : "topbar"}`}
        viewBox="0 0 1535 440"
        preserveAspectRatio="none"
        ref={waveRef}
        style={waveStyle}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          {[["main", "#247ead"], ["soft", "#3989b5"], ["accent", "#168cb8"]].map(([tone, color]) => (
            <linearGradient key={tone} id={`${fadeId}-${tone}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1535" y2="0">
              <stop offset="0" stopColor={color} stopOpacity="1" />
              <stop offset="0.82" stopColor={color} stopOpacity="1" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {upperWavePaths.map((path, index) => (
          <path
            key={path}
            d={path}
            className={`marjon-shell-wave__line marjon-shell-wave__line--${lineTone(index, false)}`}
            style={{ stroke: `url(#${fadeId}-${lineTone(index, false)})` }}
          />
        ))}
      </svg>
      {sidebar && (
        <svg
          className="marjon-shell-wave marjon-shell-wave--sidebar"
          viewBox="0 0 300 960"
          preserveAspectRatio="xMinYMax meet"
          aria-hidden="true"
          focusable="false"
        >
          {lowerSidebarPaths.map((path, index) => (
            <path key={path} d={path} className={`marjon-shell-wave__line marjon-shell-wave__line--${lineTone(index + compactContours, true)}`} />
          ))}
        </svg>
      )}
    </div>
  );
}
