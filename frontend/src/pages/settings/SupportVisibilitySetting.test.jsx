import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsProfilePage from "./SettingsProfilePage";
import { settingsService } from "../../api/settings";
import { useAuth } from "../../context/AuthContext";
import SupportWidget from "../../components/SupportWidget";

vi.mock("../../api/settings", () => ({
  settingsService: {
    getCompanyProfile: vi.fn(),
    updateCompanyProfile: vi.fn(),
  },
}));
vi.mock("../../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));
vi.mock("../../components/Icon", () => ({ default: () => <span aria-hidden="true" /> }));

const COMPANY = {
  name: "Тест",
  phone: "",
  address: "",
  inn: "",
  currency: "UZS",
  day_start_hour: 5,
  vat_rate: 12,
  show_support_button: true,
};

async function goToMain(withWidget = false) {
  render(<><SettingsProfilePage />{withWidget && <SupportWidget />}</>);
  await screen.findByText("Основные данные", { selector: ".company-profile-nav button span" });
  const nav = document.querySelector(".company-profile-nav");
  const button = [...nav.querySelectorAll("button")].find((el) => el.textContent === "Основные настройки");
  fireEvent.click(button);
  await waitFor(() => {
    expect(document.querySelector(".company-profile-content h1")).toHaveTextContent("Основные настройки");
  });
}

// Строка «Показывать кнопку поддержки»: canonical show_support_button,
// default TRUE, independent minimal autosave, no web storage.
describe("Support visibility setting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: "owner-1", full_name: "Owner" } });
    settingsService.getCompanyProfile.mockResolvedValue({ data: { ...COMPANY } });
    settingsService.updateCompanyProfile.mockResolvedValue({ data: { ...COMPANY } });
  });

  it("loads the switch ON from backend default", async () => {
    await goToMain();
    const toggle = screen.getByRole("checkbox", { name: "Показывать кнопку поддержки" });
    expect(toggle).toBeChecked();
  });

  it("saves only the changed flag and emits a live update", async () => {
    await goToMain();
    const updates = [];
    const listen = (event) => updates.push(event.detail.show_support_button);
    window.addEventListener("marjon:company-profile-updated", listen);
    const toggle = screen.getByRole("checkbox", { name: "Показывать кнопку поддержки" });
    settingsService.updateCompanyProfile.mockResolvedValue({
      data: { ...COMPANY, show_support_button: false },
    });
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(toggle).toBeDisabled();
    expect(settingsService.updateCompanyProfile).toHaveBeenCalledExactlyOnceWith({ show_support_button: false });
    expect(updates).toEqual([false]);
    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(screen.queryByText("Основные настройки сохранены.")).toBeNull();
    window.removeEventListener("marjon:company-profile-updated", listen);
  });

  it("restores truthful state when save fails", async () => {
    await goToMain();
    settingsService.updateCompanyProfile.mockRejectedValue({
      response: { data: { detail: "Ошибка сервера" } },
    });
    const toggle = screen.getByRole("checkbox", { name: "Показывать кнопку поддержки" });
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByText("Ошибка сервера")).toBeInTheDocument());
    expect(toggle).toBeChecked();
    expect(toggle).not.toBeDisabled();
  });

  it("rolls back the global button as well as the toggle on rejected PATCH", async () => {
    let rejectPatch;
    settingsService.updateCompanyProfile.mockImplementation(() => new Promise((_, reject) => { rejectPatch = reject; }));
    await goToMain(true);
    await screen.findByRole("button", { name: "Открыть поддержку" });
    const toggle = screen.getByRole("checkbox", { name: "Показывать кнопку поддержки" });
    fireEvent.click(toggle);
    expect(document.querySelector(".support-widget")).toHaveClass("is-hiding");
    await waitFor(() => expect(document.querySelector(".support-widget")).toBeNull());
    await act(async () => rejectPatch({ response: { data: { detail: "Отклонено" } } }));
    expect(toggle).toBeChecked();
    expect(document.querySelector(".support-widget")).toHaveClass("is-entering");
    expect(screen.getByText("Отклонено")).toBeInTheDocument();
  });

  it("updates the baseline; Cancel and general Save never restore or resend support", async () => {
    await goToMain();
    const toggle = screen.getByRole("checkbox", { name: "Показывать кнопку поддержки" });
    settingsService.updateCompanyProfile.mockResolvedValueOnce({ data: { ...COMPANY, show_support_button: false } });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(toggle).not.toBeChecked();
    // An unrelated Save may return an older snapshot; it cannot undo autosave.
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await screen.findByText("Основные настройки сохранены.");
    expect(settingsService.updateCompanyProfile.mock.calls[1][0]).toEqual({ day_start_hour: 5, vat_rate: 12 });
    expect(toggle).not.toBeChecked();
    settingsService.updateCompanyProfile.mockRejectedValueOnce(new Error("Rejected"));
    fireEvent.click(toggle);
    await screen.findByText("Rejected");
    expect(toggle).not.toBeChecked();
  });

  it("locks only this switch during pending PATCH, then permits the opposite change", async () => {
    let resolvePatch;
    settingsService.updateCompanyProfile.mockImplementationOnce(() => new Promise((resolve) => { resolvePatch = resolve; }));
    await goToMain();
    const toggle = screen.getByRole("checkbox", { name: "Показывать кнопку поддержки" });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(settingsService.updateCompanyProfile).toHaveBeenCalledTimes(1);
    expect(toggle).toBeDisabled();
    expect(screen.getByRole("button", { name: "Сохранить" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(toggle).not.toBeChecked();
    await act(async () => resolvePatch({ data: { ...COMPANY, show_support_button: false } }));
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(settingsService.updateCompanyProfile.mock.calls.map(([payload]) => payload)).toEqual([
      { show_support_button: false }, { show_support_button: true },
    ]);
    expect(toggle).toBeChecked();
  });

  it("ignores a late general Save response and does not autosave other drafts", async () => {
    let resolveMain;
    settingsService.updateCompanyProfile.mockImplementationOnce(() => new Promise((resolve) => { resolveMain = resolve; }));
    await goToMain();
    const toggle = screen.getByRole("checkbox", { name: "Показывать кнопку поддержки" });
    fireEvent.change(screen.getByRole("spinbutton", { name: /НДС с сервису/ }), { target: { value: "15" } });
    expect(settingsService.updateCompanyProfile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    settingsService.updateCompanyProfile.mockResolvedValueOnce({ data: { ...COMPANY, show_support_button: false } });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(settingsService.updateCompanyProfile.mock.calls[1][0]).toEqual({ show_support_button: false });
    await act(async () => resolveMain({ data: { ...COMPANY, vat_rate: 15 } }));
    expect(toggle).not.toBeChecked();
  });

  it("reloads the persisted OFF state from backend without a browser cache", async () => {
    settingsService.getCompanyProfile.mockResolvedValue({ data: { ...COMPANY, show_support_button: false } });
    await goToMain();
    expect(screen.getByRole("checkbox", { name: "Показывать кнопку поддержки" })).not.toBeChecked();
    expect(settingsService.updateCompanyProfile).not.toHaveBeenCalled();
  });

  it("declares backend support and never uses web storage", () => {
    const src = readFileSync(
      `${process.cwd()}/src/pages/settings/profile/useCompanyProfileForm.js`, "utf8",
    );
    expect(src).toMatch(/showSupportButton: \{ backendField: "show_support_button"/);
    expect(src).not.toMatch(/localStorage/);
    expect(src).not.toMatch(/sessionStorage/);
  });

  it("animates only this settings switch without changing its geometry", async () => {
    await goToMain();
    const toggle = screen.getByRole("checkbox", { name: "Показывать кнопку поддержки" });
    expect(toggle.closest("label")).toHaveClass("company-profile-toggle--support");
    const css = readFileSync(`${process.cwd()}/src/styles/shared/support-widget.css`, "utf8");
    expect(css).toMatch(/\.company-profile-toggle--support \.company-profile-toggle__track\s*\{\s*transition: background-color 180ms ease/);
    expect(css).toMatch(/\.company-profile-toggle--support \.company-profile-toggle__thumb\s*\{[^}]*margin-left: 0;[^}]*transform: translateX\(0\);[^}]*transition: transform 180ms ease/);
    expect(css).toMatch(/\.company-profile-toggle--support input:checked[^}]*margin-left: 0;[^}]*transform: translateX\(20px\)/);
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/margin-left:\s*auto/);
    expect(css).toMatch(/prefers-reduced-motion/);
  });
});
