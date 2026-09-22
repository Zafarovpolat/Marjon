import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { settingsService } from "../../api/settings";
import { useAuth } from "../../context/AuthContext";
import SettingsProfilePage from "./SettingsProfilePage";

// Регрессия FE-07C / H1: после выноса состояния в useCompanyProfileForm
// кнопка «Очистить все отчеты» ссылалась на setSuccess, который хук больше
// не отдавал → ReferenceError при клике. Тест воспроизводит реальный клик
// по кнопке и проверяет, что ошибки нет и появляется demo-сообщение.
vi.mock("../../api/settings", () => ({
  settingsService: {
    getCompanyProfile: vi.fn(),
    updateCompanyProfile: vi.fn(),
  },
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

describe("SettingsProfilePage — очистка отчетов (demo-disabled)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: "owner-1", full_name: "Владелец" } });
    settingsService.getCompanyProfile.mockResolvedValue({
      data: { name: "Мой ресторан", phone: "", address: "", inn: "", currency: "UZS" },
    });
  });

  it("показывает demo-сообщение и не бросает ReferenceError по клику", async () => {
    render(<SettingsProfilePage />);

    const clearButton = await screen.findByRole("button", { name: /Очистить все отчеты/ });
    expect(clearButton).toBeInTheDocument();

    // До фикса этот клик выбрасывал "ReferenceError: setSuccess is not defined".
    expect(() => fireEvent.click(clearButton)).not.toThrow();

    await waitFor(() => {
      expect(screen.getByText("Очистка отчетов отключена в демо-режиме.")).toBeInTheDocument();
    });
  });

  it("не выполняет реальную очистку отчетов (нет сетевых мутаций)", async () => {
    render(<SettingsProfilePage />);
    const clearButton = await screen.findByRole("button", { name: /Очистить все отчеты/ });
    fireEvent.click(clearButton);
    await screen.findByText("Очистка отчетов отключена в демо-режиме.");
    // Кнопка — чистый demo-заглушка: никаких вызовов сохранения/мутаций.
    expect(settingsService.updateCompanyProfile).not.toHaveBeenCalled();
  });
});
