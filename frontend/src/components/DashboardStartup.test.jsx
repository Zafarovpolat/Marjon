import { act, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import DashboardLayout from "./DashboardLayout";

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/settings/kitchen-receipt" }),
  Outlet: () => <div>Current page</div>,
}));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("./Sidebar", () => ({ default: ({ onToggle }) => <button onClick={onToggle}>Toggle sidebar</button> }));
vi.mock("./Topbar", () => ({ default: () => <header>Topbar</header> }));
vi.mock("./SupportWidget", () => ({ default: () => null }));

let frames, nextFrame;
beforeEach(() => {
  frames = new Map();
  nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", vi.fn(callback => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn(id => frames.delete(id)));
});
afterEach(() => { vi.unstubAllGlobals(); });
function paint() {
  act(() => {
    const queued = [...frames.values()];
    frames.clear();
    queued.forEach(callback => callback(0));
  });
}

describe("OWNER startup geometry", () => {
  it("sets shell scope and resolves geometry before enabling transitions", () => {
    const measure = vi.spyOn(Element.prototype, "getBoundingClientRect");
    const { container } = render(<DashboardLayout />);
    expect(document.body).toHaveClass("dashboard-body", "marjon-dark-shell");
    const shell = container.querySelector(".dashboard-shell");
    expect(shell).toHaveAttribute("data-shell-initializing");
    expect(measure).toHaveBeenCalled();
    paint();
    expect(shell).not.toHaveAttribute("data-shell-initializing");
  });
  it("retains real expand/collapse behavior without restarting the startup guard", () => {
    const { container } = render(<DashboardLayout />);
    paint();
    const shell = container.querySelector(".dashboard-shell");
    fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));
    expect(shell).toHaveClass("is-sidebar-collapsed");
    expect(shell).not.toHaveAttribute("data-shell-initializing");
    fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));
    expect(shell).toHaveClass("is-sidebar-expanded");
  });
  it("cleans up the frame and body scope on unmount", () => {
    const view = render(<DashboardLayout />);
    view.unmount();
    expect(frames.size).toBe(0);
    expect(document.body).not.toHaveClass("dashboard-body");
    expect(document.body).not.toHaveClass("marjon-dark-shell");
  });
  it("survives StrictMode setup/cleanup and keeps the active frame", () => {
    const view = render(<StrictMode><DashboardLayout /></StrictMode>);
    expect(frames.size).toBe(1);
    paint();
    expect(view.container.querySelector(".dashboard-shell")).not.toHaveAttribute("data-shell-initializing");
  });
  it("scopes transition suppression only to startup, without changing auth", () => {
    const css = readFileSync("src/components/dashboardStartup.css", "utf8");
    expect(css).not.toContain("!important");
    expect(css).toContain("[data-shell-initializing]");
    expect(css).toContain("[data-shell-initializing] .dashboard-topbar .dashboard-back-button--topbar-3d");
    expect(css).toContain("[data-shell-initializing] .dashboard-topbar .topbar-pay-button");
    expect(css).toContain("[data-shell-initializing] .dashboard-topbar .topbar-balance-pill");
    expect(css).toContain("transition: none");
    expect(css).not.toMatch(/margin-left:|width:|height:|animation:/);
  });
});
