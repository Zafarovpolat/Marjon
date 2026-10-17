import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar";

const owner = {
  id: "preview-owner",
  role_slugs: ["owner"],
  email: "owner@marjon.test",
  auth_scope: "app",
  company_id: "company-1",
  is_superadmin: false,
};

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="route">{location.pathname}{location.search}</output>;
}

function renderNavigation(path, collapsed = false) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar user={owner} collapsed={collapsed} onToggle={vi.fn()} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllEnvs());

describe("Dashboard preview V3 navigation", () => {
  it.each(["Навигация", "Мобильная навигация"])("preserves only previewData=1 through the real %s Dashboard Link in DEV", (navLabel) => {
    vi.stubEnv("DEV", true);
    renderNavigation("/?previewData=1&unrelated=drop&date_from=2026-10-01");
    const link = within(screen.getByRole("navigation", { name: navLabel })).getByRole("link", { name: "Дашборд" });
    expect(link).toHaveAttribute("href", "/?previewData=1");
    fireEvent.click(link);
    expect(screen.getByTestId("route")).toHaveTextContent(/^\/\?previewData=1$/);
    expect(link).toHaveClass("is-active");
  });

  it.each(["/", "/?unrelated=1", "/?previewData=0", "/?previewData=true"])("keeps the ordinary Dashboard target / for %s", (path) => {
    vi.stubEnv("DEV", true);
    renderNavigation(path);
    for (const navLabel of ["Навигация", "Мобильная навигация"]) {
      const link = within(screen.getByRole("navigation", { name: navLabel })).getByRole("link", { name: "Дашборд" });
      expect(link).toHaveAttribute("href", "/");
      fireEvent.click(link);
      expect(screen.getByTestId("route")).toHaveTextContent(/^\/$/);
    }
  });

  it("keeps production Dashboard navigation at / even when previewData=1 is present", () => {
    vi.stubEnv("DEV", false);
    renderNavigation("/?previewData=1");
    const links = screen.getAllByRole("link", { name: "Дашборд" });
    expect(links).toHaveLength(2);
    links.forEach((link) => expect(link).toHaveAttribute("href", "/"));
    fireEvent.click(links[0]);
    expect(screen.getByTestId("route")).toHaveTextContent(/^\/$/);
  });

  it("preserves the preview Dashboard target and active state in the collapsed rail", () => {
    vi.stubEnv("DEV", true);
    renderNavigation("/?previewData=1", true);
    const link = within(screen.getByRole("navigation", { name: "Навигация" })).getByRole("link", { name: "Дашборд" });
    expect(link).toHaveAttribute("href", "/?previewData=1");
    expect(link).toHaveClass("is-active");
    fireEvent.click(link);
    expect(screen.getByTestId("route")).toHaveTextContent(/^\/\?previewData=1$/);
  });

  it("does not carry preview or other query params into unrelated navigation items", () => {
    vi.stubEnv("DEV", true);
    renderNavigation("/?previewData=1&unrelated=drop");
    const menu = within(screen.getByRole("navigation", { name: "Мобильная навигация" })).getByRole("link", { name: "Меню" });
    expect(menu).toHaveAttribute("href", "/nomenclature");
    fireEvent.click(menu);
    expect(screen.getByTestId("route")).toHaveTextContent(/^\/nomenclature$/);
    expect(screen.getAllByRole("link", { name: "Дашборд" }).every((link) => link.getAttribute("href") === "/")).toBe(true);
  });
});
