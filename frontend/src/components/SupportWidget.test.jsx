import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SupportWidget from "./SupportWidget";
import { settingsService } from "../api/settings";

vi.mock("../api/settings", () => ({
  settingsService: {
    getCompanyProfile: vi.fn(),
    updateCompanyProfile: vi.fn(),
    createSupportTicket: vi.fn(),
  },
}));
vi.mock("./Icon", () => ({ default: () => <span aria-hidden="true" /> }));

// Global support button: canonical show_support_button visibility,
// #1FC9C9 color, no subtitle, soft animate. No localStorage anywhere.
describe("SupportWidget visibility + visuals", () => {
  let frames;
  let frameId;
  function frame() {
    act(() => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback());
    });
  }
  function update(value) {
    act(() => window.dispatchEvent(new CustomEvent("marjon:company-profile-updated", {
      detail: { show_support_button: value },
    })));
  }
  async function mountVisible() {
    settingsService.getCompanyProfile.mockResolvedValue({ data: { show_support_button: true } });
    const result = render(<SupportWidget />);
    await act(async () => {});
    frame();
    frame();
    return result;
  }
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    frames = new Map();
    frameId = 0;
    vi.stubGlobal("requestAnimationFrame", (callback) => { frames.set(++frameId, callback); return frameId; });
    vi.stubGlobal("cancelAnimationFrame", (id) => frames.delete(id));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("shows the button by default and hides it when backend says false", async () => {
    settingsService.getCompanyProfile.mockResolvedValue({ data: {} });
    const first = render(<SupportWidget />);
    await act(async () => {});
    frame(); frame();
    expect(screen.getByRole("button", { name: "Открыть поддержку" })).toBeInTheDocument();
    first.unmount();
    settingsService.getCompanyProfile.mockResolvedValue({ data: { show_support_button: false } });
    const { container } = render(<SupportWidget />);
    expect(container.querySelector(".support-widget")).toBeNull();
    await act(async () => {});
    expect(container.querySelector(".support-widget")).toBeNull();
  });

  it("animates away on OFF and back on ON without unmount flashes", async () => {
    const { container } = await mountVisible();
    const root = () => container.querySelector(".support-widget");
    // OFF via live company-profile event: hiding class first, unmount after.
    await act(async () => {
      window.dispatchEvent(new CustomEvent("marjon:company-profile-updated", {
        detail: { show_support_button: false },
      }));
    });
    expect(root().className).toMatch("is-hiding");
    expect(root().querySelector("button").disabled).toBe(true);
    await waitFor(() => expect(container.querySelector(".support-widget")).toBeNull());
    // ON again: button returns normally.
    await act(async () => {
      window.dispatchEvent(new CustomEvent("marjon:company-profile-updated", {
        detail: { show_support_button: true },
      }));
    });
    expect(root()).toHaveClass("is-entering");
    frame();
    expect(root()).toHaveClass("is-entering");
    frame();
    const back = screen.getByRole("button", { name: "Открыть поддержку" });
    expect(back.disabled).toBe(false);
    expect(back.closest(".support-widget").className).not.toMatch("is-hiding");
  });

  it("closes an open panel when the setting turns false", async () => {
    await mountVisible();
    fireEvent.click(screen.getByRole("button", { name: "Открыть поддержку" }));
    expect(screen.getByText("Связь с поддержкой")).toBeInTheDocument();
    await act(async () => {
      window.dispatchEvent(new CustomEvent("marjon:company-profile-updated", {
        detail: { show_support_button: false },
      }));
    });
    await waitFor(() => expect(screen.queryByText("Связь с поддержкой")).toBeNull());
  });

  it("paints the toggle #1FC9C9 with a calm hover and no subtitle", async () => {
    await mountVisible();
    fireEvent.click(screen.getByRole("button", { name: "Открыть поддержку" }));
    expect(screen.getByText("Связь с поддержкой")).toBeInTheDocument();
    expect(screen.queryByText("Ответим по кассе, складу и доступам")).toBeNull();
    const css = readFileSync(`${process.cwd()}/src/styles/shared/support-widget.css`, "utf8");
    expect(css).toMatch(/\.support-widget__toggle\s*\{[^}]*background:\s*#1FC9C9/i);
    const hover = css.match(/\.support-widget__toggle:hover[^{]*\{[^}]*\}/)?.[0] || "";
    expect(hover).toMatch(/background:\s*#1AB5B5/i);
    expect(hover).not.toMatch(/brightness|neon|glow/i);
    expect(css).toMatch(/prefers-reduced-motion/);
  });

  it("never uses localStorage/sessionStorage for business state", () => {
    const src = readFileSync(`${process.cwd()}/src/components/SupportWidget.jsx`, "utf8");
    expect(src).not.toMatch(/localStorage/);
    expect(src).not.toMatch(/sessionStorage/);
  });

  it("keeps exit mounted for 200ms and cancels an exit on reversal", async () => {
    const { container } = await mountVisible();
    vi.useFakeTimers();
    const root = container.querySelector(".support-widget");
    update(false);
    act(() => vi.advanceTimersByTime(199));
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute("aria-hidden", "true");
    update(true);
    act(() => vi.advanceTimersByTime(201));
    expect(container.querySelector(".support-widget")).toBe(root);
    expect(root).not.toHaveClass("is-hiding");
    update(false);
    act(() => vi.advanceTimersByTime(200));
    expect(container.querySelector(".support-widget")).toBeNull();
  });

  it("does not let a late initial GET overwrite a live OFF choice", async () => {
    let resolveGet;
    settingsService.getCompanyProfile.mockImplementation(() => new Promise((resolve) => { resolveGet = resolve; }));
    const { container } = render(<SupportWidget />);
    update(false);
    await act(async () => resolveGet({ data: { show_support_button: true } }));
    expect(container.querySelector(".support-widget")).toBeNull();
  });

  it("cancels unpainted entering frames when disabled and on unmount", async () => {
    settingsService.getCompanyProfile.mockResolvedValue({ data: { show_support_button: true } });
    const { container, unmount } = render(<SupportWidget />);
    await act(async () => {});
    expect(container.querySelector(".support-widget")).toHaveClass("is-entering");
    expect(frames.size).toBe(1);
    frame();
    update(false);
    expect(frames.size).toBe(0);
    unmount();
    expect(frames.size).toBe(0);
  });
});
