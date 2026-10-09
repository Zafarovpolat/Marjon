import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { settingsService } from "../../api/settings";
import { useAuth } from "../../context/AuthContext";
import SettingsProfilePage from "./SettingsProfilePage";
import { profileSections } from "./profile/profileSections";

const profileCss = readFileSync(
  join(process.cwd(), "src", "styles", "react-overrides.css"),
  "utf8",
);

// V1: ровно 4 внутренние секции, у каждой свой контент.
// Поля без backend-поддержки рисуются, но не отправляются и не дают
// ложного успеха; деструктивных мутаций нет.
vi.mock("../../api/settings", () => ({
  settingsService: {
    getCompanyProfile: vi.fn(),
    updateCompanyProfile: vi.fn(),
  },
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const COMPANY = {
  name: "Мой ресторан",
  phone: "+998901234567",
  address: "Ташкент",
  inn: "123456789",
  currency: "UZS",
  waiter_service_percent: 10,
  day_start_hour: 5,
  vat_rate: 12,
};

function navButtons() {
  return document.querySelector(".company-profile-nav");
}

function sectionLabels() {
  return [...navButtons().querySelectorAll("button span")].map((el) => el.textContent);
}

async function renderPage() {
  render(<SettingsProfilePage />);
  await screen.findByText("Основные данные", { selector: ".company-profile-nav button span" });
}

async function goTo(label) {
  const nav = navButtons();
  const button = [...nav.querySelectorAll("button")].find((el) => el.textContent === label);
  fireEvent.click(button);
  await waitFor(() => {
    expect(document.querySelector(".company-profile-content h1")).toHaveTextContent(label);
  });
}

describe("SettingsProfilePage V3 — success toast и truthful имя", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: "owner-1", full_name: "Владелец" } });
    settingsService.getCompanyProfile.mockResolvedValue({ data: { ...COMPANY } });
    settingsService.updateCompanyProfile.mockResolvedValue({ data: { ...COMPANY } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function saveBasic() {
    fireEvent.change(screen.getByPlaceholderText("Название компании"), { target: { value: "Новое имя" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await screen.findByText("Профиль сохранён.");
  }

  it("success виден 4с, уходит к 5с и размонтируется", async () => {
    await renderPage();
    vi.useFakeTimers();
    fireEvent.change(screen.getByPlaceholderText("Название компании"), { target: { value: "Новое имя" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const banner = screen.getByText("Профиль сохранён.");
    expect(banner.className).not.toContain("is-leaving");
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(screen.getByText("Профиль сохранён.")).toBeInTheDocument();
    expect(screen.getByText("Профиль сохранён.").className).not.toContain("is-leaving");
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(screen.getByText("Профиль сохранён.").className).toContain("is-leaving");
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(screen.queryByText("Профиль сохранён.")).not.toBeInTheDocument();
  });

  it("повторный Save перезапускает 5-секундный таймер", async () => {
    await renderPage();
    vi.useFakeTimers();
    fireEvent.change(screen.getByPlaceholderText("Название компании"), { target: { value: "Имя 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    screen.getByText("Профиль сохранён.");
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    fireEvent.change(screen.getByPlaceholderText("Название компании"), { target: { value: "Имя 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(screen.getByText("Профиль сохранён.")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.queryByText("Профиль сохранён.")).not.toBeInTheDocument();
  });

  it("failed Save не показывает success", async () => {
    await renderPage();
    settingsService.updateCompanyProfile.mockRejectedValueOnce({ response: { data: { detail: "Ошибка сервера" } } });
    fireEvent.change(screen.getByPlaceholderText("Название компании"), { target: { value: "Новое имя" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await screen.findByText("Ошибка сервера");
    expect(screen.queryByText("Профиль сохранён.")).not.toBeInTheDocument();
  });

  it("Cancel и смена секции очищают success сразу", async () => {
    await renderPage();
    await saveBasic();
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(screen.queryByText("Профиль сохранён.")).not.toBeInTheDocument();
    await saveBasic();
    await goTo("Другие настройки");
    expect(screen.queryByText("Профиль сохранён.")).not.toBeInTheDocument();
  });

  it("грязное имя профиля честно помечается в success и никуда не сохраняется", async () => {
    useAuth.mockReturnValue({ user: { id: "owner-1", name: "Анвар" } });
    await renderPage();
    fireEvent.change(screen.getByPlaceholderText("Введите имя профиля"), { target: { value: "Жахонгир Бахтиёров" } });
    fireEvent.change(screen.getByPlaceholderText("Название компании"), { target: { value: "Мой ресторан" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await screen.findByText(/Имя профиля требует backend и не сохранено/);
    const payload = settingsService.updateCompanyProfile.mock.calls[0][0];
    expect(JSON.stringify(payload)).not.toContain("Жахонгир");
    const stored = JSON.parse(localStorage.getItem("marjon_profile_settings:owner-1") || "{}");
    expect(stored.profileName).toBeUndefined();
    expect("profileName" in stored).toBe(false);
  });

  it("фото: preview из кэша, замена работает, имя фото не трогает", async () => {
    const photo = "data:image/png;base64,AAA";
    localStorage.setItem("marjon_profile_settings:owner-1", JSON.stringify({ photo }));
    await renderPage();
    expect(screen.getByAltText("Лого профиля")).toHaveAttribute("src", photo);
    const file = new File(["pixels"], "avatar.png", { type: "image/png" });
    const input = document.querySelector('.company-profile-identity input[type="file"]');
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByAltText("Лого профиля").getAttribute("src")).toMatch(/^data:image\/png/);
    });
    // Имя профиля не влияет на фото-состояние.
    fireEvent.change(screen.getByPlaceholderText("Введите имя профиля"), { target: { value: "Жахонгир" } });
    expect(screen.getByAltText("Лого профиля").getAttribute("src")).toMatch(/^data:image\/png/);
  });

  it("внутреннее меню содержит ровно 4 секции", async () => {
    await renderPage();
    expect(sectionLabels()).toEqual([
      "Основные данные",
      "Основные настройки",
      "Другие настройки",
      "Настройка профиля",
    ]);
  });

  it("удалённые секции отсутствуют", async () => {
    await renderPage();
    const labels = sectionLabels();
    [
      "Настройки для чека",
      "Настройки кассира",
      "Настройки для онлайн меню",
      "Скидки",
      "Чек конструктор",
      "Импорт",
      "Telegram бот настройки",
      "Старая версия",
    ].forEach((label) => expect(labels).not.toContain(label));
  });

  it("Основные данные: точный набор полей без лишнего", async () => {
    await renderPage();
    const content = document.querySelector(".company-profile-content");
    expect(within(content).getByText("Лого компании")).toBeInTheDocument();
    expect(within(content).getByText("Лого профиля")).toBeInTheDocument();
    expect(within(content).getByText("Имя профиля")).toBeInTheDocument();
    expect(within(content).getByPlaceholderText("Введите имя профиля")).toBeInTheDocument();
    expect(within(content).getByPlaceholderText("Название компании")).toBeInTheDocument();
    expect(within(content).getByPlaceholderText("Введите адрес")).toBeInTheDocument();
    expect(within(content).getByPlaceholderText("123456789")).toBeInTheDocument();
    expect(within(content).getByRole("button", { name: /Очистить все отчеты/ })).toBeInTheDocument();
    // В V1 здесь нет телефона/валюты/обслуги/начала дня.
    expect(within(content).queryByText("Телефон")).not.toBeInTheDocument();
    expect(within(content).queryByText("Валюта")).not.toBeInTheDocument();
    expect(within(content).queryByText(/Доля обслуги/)).not.toBeInTheDocument();
    expect(within(content).queryByText(/Сброс нумерации/)).not.toBeInTheDocument();
  });

  it("Лого профиля: заголовок сверху, Очистить скрыта, имя — широким рядом", async () => {
    await renderPage();
    const main = document.querySelector(".company-profile-main");
    const html = main.innerHTML;
    expect(html.indexOf("Лого профиля")).toBeLessThan(html.indexOf("Лого компании"));
    const identity = document.querySelector(".company-profile-identity");
    expect(identity).toBeInTheDocument();
    const title = identity.querySelector(".company-profile-identity-title");
    const row = identity.querySelector(".company-profile-identity-row");
    const actions = identity.querySelector(".company-profile-logo-actions");
    const nameLabel = identity.querySelector(".company-profile-identity-name");
    // Заголовок блока — над логотипом.
    expect(title.textContent).toBe("Лого профиля");
    expect(title.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(actions.querySelector("img[alt='Лого профиля']")).toBeInTheDocument();
    expect(actions.textContent).toContain("Заменить");
    // Кнопки Очистить для профиля нет вообще.
    expect([...identity.querySelectorAll("button")].map((b) => b.textContent)).not.toContain("Очистить");
    // Имя — отдельным полем в том же ряду (шире прежней колонки 430px).
    expect(nameLabel.querySelector("input[placeholder='Введите имя профиля']")).toBeInTheDocument();
    expect(identity.textContent).not.toContain("Отображается в боковом меню");
    expect(identity.textContent).not.toContain("Требуется backend");
  });

  it("внутренние секции: согласованные иконки одного семейства, фон #f4f7fc", async () => {
    expect(profileSections.map((s) => s.icon)).toEqual([
      "bi-journal-text",
      "bi-sliders",
      "bi-list-check",
      "bi-person-gear",
    ]);
    await renderPage();
    const buttons = [...document.querySelectorAll(".company-profile-nav button")];
    expect(buttons).toHaveLength(4);
    // Все иконки рендерятся (Icon не вернул null) и одинакового размера.
    buttons.forEach((button) => {
      const svg = button.querySelector("svg");
      expect(svg).toBeInTheDocument();
      expect(svg.getAttribute("width")).toBe("18");
    });
    const navRule = profileCss.match(/\.company-profile-nav \{[^}]*\}/)?.[0] || "";
    expect(navRule).toContain("background: #f4f7fc");
  });

  it("Имя профиля: truthful initial из user, в save не отправляется", async () => {
    useAuth.mockReturnValue({ user: { id: "owner-1", name: "Анвар" } });
    await renderPage();
    expect(screen.getByPlaceholderText("Введите имя профиля")).toHaveValue("Анвар");
    fireEvent.change(screen.getByPlaceholderText("Введите имя профиля"), { target: { value: "Новое имя" } });
    fireEvent.change(screen.getByPlaceholderText("Название компании"), { target: { value: "Мой ресторан" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(settingsService.updateCompanyProfile).toHaveBeenCalled());
    const payload = settingsService.updateCompanyProfile.mock.calls[0][0];
    expect(payload).toEqual({
      name: "Мой ресторан",
      phone: COMPANY.phone,
      address: COMPANY.address,
      inn: COMPANY.inn,
      currency: COMPANY.currency,
    });
    expect(JSON.stringify(payload)).not.toContain("Новое имя");
  });

  it("шапка использует accepted Settings primitive", async () => {
    await renderPage();
    const header = document.querySelector(".company-profile-header");
    expect(header.querySelector(".settings-title-group")).toBeInTheDocument();
    expect(header.querySelector(".settings-accent-bar")).toBeInTheDocument();
    expect(within(header).getByText("Настройки")).toBeInTheDocument();
    expect(document.querySelector(".company-profile-title")).not.toBeInTheDocument();
    expect(document.querySelector(".company-profile-accent")).not.toBeInTheDocument();
  });

  it("активна ровно одна секция; старая синяя активная стилистика удалена из CSS", async () => {
    await renderPage();
    expect(document.querySelectorAll(".company-profile-nav button.is-active")).toHaveLength(1);
    await goTo("Другие настройки");
    const active = [...document.querySelectorAll(".company-profile-nav button.is-active")];
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveTextContent("Другие настройки");
    // Старое: бледно-синий фон + синяя левая граница + navy Save.
    const activeRule = profileCss.match(/\.company-profile-nav button\.is-active \{[^}]*\}/)?.[0] || "";
    expect(activeRule).toContain("background: var(--owner-accent, #1fc9c9)");
    expect(activeRule).toContain("color: #ffffff");
    expect(activeRule).not.toContain("inset");
    expect(activeRule).not.toContain("#eef5ff");
    expect(activeRule).not.toContain("#0d55ca");
    expect(profileCss).not.toContain("inset 4px 0 0 #1f80ff");
    expect(profileCss).not.toContain("background: #053f9d");
    // V4: кнопки секций — радиус 22px и мягкий transition без transform.
    const navRule = profileCss.match(/\.company-profile-nav button \{[^}]*\}/)?.[0] || "";
    expect(navRule).toContain("border-radius: 22px");
    expect(navRule).toContain("transition: background-color 180ms");
    expect(navRule).not.toContain("transform");
  });

  it("Основные данные: сохранение шлёт канонические поля и бережёт телефон/валюту", async () => {
    await renderPage();
    fireEvent.change(screen.getByPlaceholderText("Название компании"), { target: { value: "Новое имя" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(settingsService.updateCompanyProfile).toHaveBeenCalled());
    expect(settingsService.updateCompanyProfile).toHaveBeenCalledWith({
      name: "Новое имя",
      phone: COMPANY.phone,
      address: COMPANY.address,
      inn: COMPANY.inn,
      currency: COMPANY.currency,
    });
  });

  it("Очистить все отчеты заблокирована и ничего не удаляет", async () => {
    await renderPage();
    const clearButton = screen.getByRole("button", { name: /Очистить все отчеты/ });
    expect(clearButton).toBeDisabled();
    fireEvent.click(clearButton);
    expect(settingsService.updateCompanyProfile).not.toHaveBeenCalled();
    expect(screen.queryByText("Профиль сохранён.")).not.toBeInTheDocument();
  });

  it("Основные настройки: точный набор из 7 полей", async () => {
    await renderPage();
    await goTo("Основные настройки");
    const content = document.querySelector(".company-profile-content");
    expect(within(content).getByText("Начало дня")).toBeInTheDocument();
    expect(within(content).getByText("Пароль для удаления блюд")).toBeInTheDocument();
    expect(within(content).getByText("Пароль для удаления блюд после пречека")).toBeInTheDocument();
    expect(within(content).getByText("Пароль при смене официанта")).toBeInTheDocument();
    expect(within(content).getByText("Пароль для восстановления заказа")).toBeInTheDocument();
    expect(within(content).getByText("Цена доставки")).toBeInTheDocument();
    expect(within(content).getByText("НДС с сервису (%)")).toBeInTheDocument();
  });

  it("Основные настройки: отправляются только day_start_hour и vat_rate", async () => {
    await renderPage();
    await goTo("Основные настройки");
    const content = document.querySelector(".company-profile-content");
    const passwordInputs = within(content).getAllByPlaceholderText("Введите пароль");
    expect(passwordInputs).toHaveLength(4);
    fireEvent.change(passwordInputs[0], { target: { value: "secret123" } });
    fireEvent.click(within(document.querySelector(".company-profile-header")).getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(settingsService.updateCompanyProfile).toHaveBeenCalled());
    const payload = settingsService.updateCompanyProfile.mock.calls[0][0];
    expect(payload).toEqual({ day_start_hour: 5, vat_rate: 12 });
    expect(JSON.stringify(payload)).not.toContain("secret123");
    expect(screen.getByText("Основные настройки сохранены.")).toBeInTheDocument();
  });

  it("Другие настройки: ровно 3 типа заказа, без Telegram и нижних параметров", async () => {
    await renderPage();
    await goTo("Другие настройки");
    const content = document.querySelector(".company-profile-content");
    expect(within(content).getByText("На стол")).toBeInTheDocument();
    expect(within(content).getByText("На вынос")).toBeInTheDocument();
    expect(within(content).getByText("Доставка")).toBeInTheDocument();
    expect(within(content).queryByText(/Телеграм|Telegram/i)).not.toBeInTheDocument();
    expect(within(content).queryByText("Другие параметры")).not.toBeInTheDocument();
    expect(within(content).queryByText(/1 стол 1 официант/)).not.toBeInTheDocument();
    expect(within(content).queryByText(/ID карт/)).not.toBeInTheDocument();
  });

  it("Другие настройки: тогл сохраняется через PATCH order_types", async () => {
    await renderPage();
    await goTo("Другие настройки");
    const header = document.querySelector(".company-profile-header");
    const save = within(header).getByRole("button", { name: "Сохранить" });
    expect(save).not.toBeDisabled();
    const toggle = screen.getByRole("checkbox", { name: "Доставка" });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    fireEvent.click(save);
    await waitFor(() => expect(settingsService.updateCompanyProfile).toHaveBeenCalled());
    expect(settingsService.updateCompanyProfile).toHaveBeenCalledWith({
      order_types: { dine_in: true, takeaway: true, delivery: false },
    });
    expect(await screen.findByText("Типы заказа сохранены.")).toBeInTheDocument();
  });

  it("Другие настройки: серверные значения грузятся, Отменить откатывает к ним", async () => {
    settingsService.getCompanyProfile.mockResolvedValue({
      data: { ...COMPANY, order_types: { dine_in: false, takeaway: true, delivery: true } },
    });
    await renderPage();
    await goTo("Другие настройки");
    expect(screen.getByRole("checkbox", { name: "На стол" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "На стол" }));
    expect(screen.getByRole("checkbox", { name: "На стол" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(screen.getByRole("checkbox", { name: "На стол" })).not.toBeChecked();
    expect(settingsService.updateCompanyProfile).not.toHaveBeenCalled();
  });

  it("Настройка профиля: только два поля пароля и Сохранить", async () => {
    await renderPage();
    await goTo("Настройка профиля");
    const content = document.querySelector(".company-profile-content");
    expect(within(content).getByPlaceholderText("Введите новый пароль")).toBeInTheDocument();
    expect(within(content).getByPlaceholderText("Повторите новый пароль")).toBeInTheDocument();
    expect(within(content).getByRole("button", { name: "Сохранить" })).toBeInTheDocument();
    // Шапочных Отменить/Сохранить у этой секции нет.
    expect(document.querySelector(".company-profile-header .company-profile-actions")).not.toBeInTheDocument();
  });

  it("Настройка профиля: несовпадение блокируется без мутаций", async () => {
    await renderPage();
    await goTo("Настройка профиля");
    fireEvent.change(screen.getByPlaceholderText("Введите новый пароль"), { target: { value: "Password1" } });
    fireEvent.change(screen.getByPlaceholderText("Повторите новый пароль"), { target: { value: "Password2" } });
    fireEvent.click(document.querySelector(".company-profile-password-actions .company-profile-save"));
    expect(await screen.findByText("Пароли не совпадают.")).toBeInTheDocument();
    expect(settingsService.updateCompanyProfile).not.toHaveBeenCalled();
  });

  it("Настройка профиля: валидный пароль честно сообщает об отсутствии backend", async () => {
    await renderPage();
    await goTo("Настройка профиля");
    fireEvent.change(screen.getByPlaceholderText("Введите новый пароль"), { target: { value: "Password1" } });
    fireEvent.change(screen.getByPlaceholderText("Повторите новый пароль"), { target: { value: "Password1" } });
    fireEvent.click(document.querySelector(".company-profile-password-actions .company-profile-save"));
    expect(await screen.findByText(/backend-эндпоинт отсутствует/)).toBeInTheDocument();
    expect(settingsService.updateCompanyProfile).not.toHaveBeenCalled();
  });

  it("каждая секция рендерит только свой контент", async () => {
    await renderPage();
    // basic: нет контента main/other/profile
    expect(screen.queryByText("Начало дня")).not.toBeInTheDocument();
    expect(screen.queryByText("На вынос")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Введите новый пароль")).not.toBeInTheDocument();
    // main: нет basic-контента
    await goTo("Основные настройки");
    expect(screen.queryByPlaceholderText("Название компании")).not.toBeInTheDocument();
    expect(screen.queryByText("Лого компании")).not.toBeInTheDocument();
    // other: нет basic/main-контента
    await goTo("Другие настройки");
    expect(screen.queryByPlaceholderText("Название компании")).not.toBeInTheDocument();
    expect(screen.queryByText("Начало дня")).not.toBeInTheDocument();
    // profile: нет чужого контента
    await goTo("Настройка профиля");
    expect(screen.queryByPlaceholderText("Название компании")).not.toBeInTheDocument();
    expect(screen.queryByText("Начало дня")).not.toBeInTheDocument();
    expect(screen.queryByText("Доставка")).not.toBeInTheDocument();
  });
});
