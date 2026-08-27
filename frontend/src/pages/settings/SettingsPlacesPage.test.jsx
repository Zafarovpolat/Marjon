import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { settingsService } from "../../api/settings";
import SettingsPlacesPage from "./SettingsPlacesPage";

vi.mock("../../api/settings", () => ({
  settingsService: {
    listPlaces: vi.fn(),
    createPlace: vi.fn(() => Promise.resolve({ data: { id: "new" } })),
    updatePlace: vi.fn(() => Promise.resolve({ data: {} })),
    deactivatePlace: vi.fn(() => Promise.resolve({ data: {} })),
    createPlaceTable: vi.fn(() => Promise.resolve({ data: { id: "nt" } })),
    updatePlaceTable: vi.fn(() => Promise.resolve({ data: {} })),
    deactivatePlaceTable: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

const HALLS = [
  { id: "h-zal", name: "Зал", is_active: true, condition: "10%", percent: 10, pricing_type: "percent", description: "Главный зал", tables: [
    { id: "t-z1", hall_id: "h-zal", number: 1, capacity: 4, is_active: true },
    { id: "t-z2", hall_id: "h-zal", number: 2, capacity: 2, is_active: true },
    { id: "t-z5", hall_id: "h-zal", number: 5, capacity: 6, is_active: true },
  ] },
  { id: "h-bar", name: "Бар", is_active: true, tables: [
    { id: "t-b1", hall_id: "h-bar", number: 1, capacity: 2, is_active: true },
    { id: "t-b5", hall_id: "h-bar", number: 5, capacity: 4, is_active: true },
  ] },
  { id: "h-bal", name: "Балкон", is_active: true, tables: [] },
];

function mockList(data) {
  settingsService.listPlaces.mockImplementation(() => Promise.resolve({ data }));
}
function renderPage() {
  return render(<MemoryRouter initialEntries={["/settings/places"]}><SettingsPlacesPage /></MemoryRouter>);
}
async function enterHall(name) {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: `Открыть столы: ${name}` }));
  await screen.findByRole("heading", { name });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList(HALLS);
});

// placeholder-tests

describe("SettingsPlacesPage — places list", () => {
  it("renders real places with counts, no accordion tables inline, no demo data", async () => {
    renderPage();
    await screen.findByText("Зал");
    expect(screen.getByText("Бар")).toBeInTheDocument();
    expect(screen.getByText("Балкон")).toBeInTheDocument();
    expect(screen.getByText("3 стола")).toBeInTheDocument();
    expect(screen.getByText("2 стола")).toBeInTheDocument();
    expect(screen.getByText("0 столов")).toBeInTheDocument();
    // list view must NOT render a tables grid inline (drill-down, not accordion)
    expect(screen.queryByText("№ стола")).not.toBeInTheDocument();
    ["ЗАЛЛ", "КАБИНА", "Billiard", "БРОН"].forEach((d) => expect(screen.queryByText(d)).not.toBeInTheDocument());
    // no table id leaks
    expect(document.body.textContent).not.toContain("t-z1");
  });

  it("drills into a place and back", async () => {
    await enterHall("Зал");
    expect(screen.getByText("Столы — Зал")).toBeInTheDocument();
    // other halls no longer listed (we are in the tables view)
    expect(screen.queryByText("Бар")).not.toBeInTheDocument();
    const region = document.body;
    expect(within(region).getAllByText("Редактировать").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Места" }));
    await screen.findByText("Бар");
    expect(screen.queryByText("Столы — Зал")).not.toBeInTheDocument();
  });

  it("top-level empty state has no center CTA, only the top-right create button", async () => {
    mockList([]);
    renderPage();
    expect(await screen.findByText("Мест пока нет")).toBeInTheDocument();
    // the central "Добавить первое место" CTA was removed
    expect(screen.queryByRole("button", { name: "Добавить первое место" })).toBeNull();
    // the only primary create action is the top-right button
    expect(screen.getByRole("button", { name: "Добавить место" })).toBeInTheDocument();
  });

  it("error + retry", async () => {
    settingsService.listPlaces.mockRejectedValueOnce(new Error("boom"));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Повторить" }));
    await screen.findByText("Зал");
    expect(settingsService.listPlaces).toHaveBeenCalledTimes(2);
  });

  it("deactivate hall calls the service and refreshes", async () => {
    renderPage();
    await screen.findByText("Зал");
    fireEvent.click(screen.getAllByRole("button", { name: "Деактивировать место" })[0]);
    await waitFor(() => expect(settingsService.deactivatePlace).toHaveBeenCalledWith("h-zal"));
    await waitFor(() => expect(settingsService.listPlaces).toHaveBeenCalledTimes(2));
  });
});

describe("SettingsPlacesPage — place drawer (free-text name)", () => {
  it("add place uses a text input (never a dropdown) and accepts custom names", async () => {
    renderPage();
    await screen.findByText("Зал");
    fireEvent.click(screen.getByRole("button", { name: "Добавить место" }));
    const nameInput = screen.getByPlaceholderText("Введите название");
    expect(nameInput.tagName).toBe("INPUT");
    // there is no preset hall-name <select> in the drawer
    const form = document.querySelector(".settings-form");
    expect(within(form).queryByDisplayValue("Зал")).toBeNull();
    fireEvent.change(nameInput, { target: { value: "VIP-зал" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await waitFor(() => expect(settingsService.createPlace).toHaveBeenCalledWith(
      expect.objectContaining({ name: "VIP-зал" })));
    await waitFor(() => expect(settingsService.listPlaces).toHaveBeenCalledTimes(2));
  });

  it("edit place populates the name as editable text", async () => {
    renderPage();
    await screen.findByText("Зал");
    fireEvent.click(screen.getAllByRole("button", { name: "Редактировать" })[0]);
    const nameInput = screen.getByPlaceholderText("Введите название");
    expect(nameInput.tagName).toBe("INPUT");
    expect(nameInput).toHaveValue("Зал");
  });

  // Portal proof: the drawer is a top-level modal (createPortal → document.body),
  // NOT a descendant of the page subtree (which is inside .dashboard-content in
  // the app shell). This is what frees it from the shell stacking context.
  it("renders the drawer via a body portal, outside the page subtree", async () => {
    const { container } = renderPage();
    await screen.findByText("Зал");
    fireEvent.click(screen.getByRole("button", { name: "Добавить место" }));
    const drawer = document.querySelector(".settings-drawer");
    expect(drawer).toBeInTheDocument();
    // escaped the rendered page subtree entirely
    expect(container.contains(drawer)).toBe(false);
    expect(document.querySelector(".settings-places-page").contains(drawer)).toBe(false);
    // portal wrapper keeps the owner-view styling scope around the drawer
    expect(drawer.closest(".settings-owner-view")).not.toBeNull();
    expect(within(drawer).getByRole("button", { name: "Добавить" })).toBeInTheDocument();
  });

  it("uses a centered aria-modal dialog (not a native browser dialog)", async () => {
    renderPage();
    await screen.findByText("Зал");
    fireEvent.click(screen.getByRole("button", { name: "Добавить место" }));
    const dialog = document.querySelector(".settings-modal");
    expect(dialog).toBeInTheDocument();
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.querySelector(".settings-modal-overlay")).toBeInTheDocument();
  });

  it('"Место" is a free-text input, never a select/preset', async () => {
    renderPage();
    await screen.findByText("Зал");
    fireEvent.click(screen.getByRole("button", { name: "Добавить место" }));
    const form = document.querySelector(".settings-form");
    const placeField = within(form).getByText("Место").parentElement.querySelector("input, select, textarea");
    expect(placeField.tagName).toBe("INPUT");
    fireEvent.change(placeField, { target: { value: "Второй этаж, у окна" } });
    expect(placeField).toHaveValue("Второй этаж, у окна");
  });

  it("renders service percent and Доп. цена selector; reveals the matching price field", async () => {
    renderPage();
    await screen.findByText("Зал");
    fireEvent.click(screen.getByRole("button", { name: "Добавить место" }));
    const form = document.querySelector(".settings-form");
    expect(within(form).getByPlaceholderText("Введите % обслуживания")).toBeInTheDocument();
    const select = within(form).getByRole("combobox");
    // no additional-price field until a type is chosen
    expect(within(form).queryByText("Дополнительная цена *")).toBeNull();
    expect(within(form).queryByText("Цена за час *")).toBeNull();
    // "Дополнительная цена" (fixed) reveals the fixed-price field
    fireEvent.change(select, { target: { value: "fixed" } });
    expect(within(form).getByText("Дополнительная цена *")).toBeInTheDocument();
    // switching to "Цена за час" (hourly) swaps the conditional field
    fireEvent.change(select, { target: { value: "hourly" } });
    expect(within(form).getByText("Цена за час *")).toBeInTheDocument();
    expect(within(form).queryByText("Дополнительная цена *")).toBeNull();
    // clearing hides it again
    fireEvent.change(select, { target: { value: "" } });
    expect(within(form).queryByText("Цена за час *")).toBeNull();
  });

  it("Escape closes the modal", async () => {
    renderPage();
    await screen.findByText("Зал");
    fireEvent.click(screen.getByRole("button", { name: "Добавить место" }));
    expect(document.querySelector(".settings-modal")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(document.querySelector(".settings-modal")).toBeNull());
  });
});

describe("SettingsPlacesPage — tables view", () => {
  it("renders tables for the selected hall without a hall column or ids", async () => {
    await enterHall("Зал");
    expect(screen.getByText("№1")).toBeInTheDocument();
    expect(screen.getByText("№5")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("t-z5");
  });

  it("selected hall with zero tables shows the tables empty state", async () => {
    await enterHall("Балкон");
    expect(screen.getByText("Столов пока нет")).toBeInTheDocument();
  });

  it("add table drawer shows hall context and has NO hall selector", async () => {
    await enterHall("Зал");
    fireEvent.click(screen.getByRole("button", { name: "Добавить стол" }));
    const form = document.querySelector(".settings-form");
    expect(within(form).getByText("Добавить стол")).toBeInTheDocument();
    expect(within(form).getByText(/Место:/)).toBeInTheDocument();
    expect(within(form).queryByRole("combobox")).toBeNull(); // no hall dropdown (create mode)
    expect(screen.getByPlaceholderText("Напр. 5")).toBeInTheDocument();
  });

  it("edit table populates number & capacity", async () => {
    await enterHall("Зал");
    fireEvent.click(screen.getAllByRole("button", { name: "Редактировать" })[0]);
    const form = document.querySelector(".settings-form");
    const number = within(form).getByText("Номер стола *").parentElement.querySelector("input");
    expect(number).toHaveValue("1");
  });

  it("deactivate table calls the service with hall + table ids", async () => {
    await enterHall("Зал");
    fireEvent.click(screen.getAllByRole("button", { name: "Деактивировать стол" })[0]);
    await waitFor(() => expect(settingsService.deactivatePlaceTable).toHaveBeenCalledWith("h-zal", "t-z1"));
  });

  it("create table from the selected hall targets the correct hall id", async () => {
    await enterHall("Зал");
    fireEvent.click(screen.getByRole("button", { name: "Добавить стол" }));
    fireEvent.change(screen.getByPlaceholderText("Напр. 5"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await waitFor(() => expect(settingsService.createPlaceTable).toHaveBeenCalledWith(
      "h-zal", expect.objectContaining({ number: 9 })));
  });
});

describe("SettingsPlacesPage — modal micro-interactions", () => {
  async function openAddPlace() {
    renderPage();
    await screen.findByText("Зал");
    fireEvent.click(screen.getByRole("button", { name: "Добавить место" }));
    return document.querySelector(".settings-form");
  }

  it("formats the price with thousands spaces while keeping a raw numeric value", async () => {
    const form = await openAddPlace();
    fireEvent.change(within(form).getByRole("combobox"), { target: { value: "fixed" } });
    const price = within(form).getByPlaceholderText("Введите цену");
    fireEvent.change(price, { target: { value: "1000" } });
    expect(price).toHaveValue("1 000");
    fireEvent.change(price, { target: { value: "100000" } });
    expect(price).toHaveValue("100 000");
    fireEvent.change(price, { target: { value: "1000000" } });
    expect(price).toHaveValue("1 000 000");
    // stray spaces / letters are stripped from the raw value
    fireEvent.change(price, { target: { value: "1 2a3" } });
    expect(price).toHaveValue("123");
    // submit → canonical condition is raw digits, never the grouped string
    fireEvent.change(within(form).getByPlaceholderText("Введите название"), { target: { value: "VIP" } });
    fireEvent.change(price, { target: { value: "12500000" } });
    fireEvent.click(within(form).getByRole("button", { name: "Добавить" }));
    await waitFor(() => expect(settingsService.createPlace).toHaveBeenCalledWith(
      expect.objectContaining({ name: "VIP", pricing_type: "fixed", condition: "12500000" })));
  });

  it("does not thousands-format the service percent", async () => {
    const form = await openAddPlace();
    const percent = within(form).getByPlaceholderText("Введите % обслуживания");
    fireEvent.change(percent, { target: { value: "10" } });
    expect(percent).toHaveValue("10");
  });

  it("Место is a non-persisted text field (Phase 5C helper) and percent label matches its optional behavior", async () => {
    const form = await openAddPlace();
    // Место = free-text input (never a select) with the temporary Phase 5C note
    const place = within(form).getByText("Место").parentElement.querySelector("input, select, textarea");
    expect(place.tagName).toBe("INPUT");
    expect(within(form).getByText("Сохранение будет подключено на следующем этапе")).toBeInTheDocument();
    // percent label carries NO required asterisk (behavior is optional)
    expect(within(form).getByText("% обслуживания в заведении")).toBeInTheDocument();
    // name + Место only, no percent → create succeeds; Место is NOT persisted
    fireEvent.change(within(form).getByPlaceholderText("Введите название"), { target: { value: "Терраса" } });
    fireEvent.change(place, { target: { value: "у окна" } });
    fireEvent.click(within(form).getByRole("button", { name: "Добавить" }));
    await waitFor(() => expect(settingsService.createPlace).toHaveBeenCalledTimes(1));
    const payload = settingsService.createPlace.mock.calls[0][0];
    expect(payload).toEqual(expect.objectContaining({ name: "Терраса" }));
    expect(payload).not.toHaveProperty("place");
    expect(payload).not.toHaveProperty("location");
    expect(payload.percent).toBeNull(); // optional, never fabricated
  });

  it("restores a grouped price when editing a place", async () => {
    mockList([{ id: "h1", name: "VIP", is_active: true, pricing_type: "fixed", condition: "250000", tables: [] }]);
    renderPage();
    await screen.findByText("VIP");
    fireEvent.click(screen.getAllByRole("button", { name: "Редактировать" })[0]);
    const form = document.querySelector(".settings-form");
    expect(within(form).getByPlaceholderText("Введите цену")).toHaveValue("250 000");
  });

  it("Отмена plays the exit phase, then unmounts (single close path)", async () => {
    renderPage();
    await screen.findByText("Зал");
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole("button", { name: "Добавить место" }));
      expect(document.querySelector(".settings-modal")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
      // still mounted while the exit animation plays
      expect(document.querySelector(".settings-modal-overlay.is-closing")).toBeInTheDocument();
      expect(document.querySelector(".settings-modal")).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(200); });
      expect(document.querySelector(".settings-modal")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
