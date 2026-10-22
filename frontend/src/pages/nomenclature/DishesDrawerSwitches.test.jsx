import { readFileSync } from "node:fs";
import { useState } from "react";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import DishesDialogs from "./DishesDialogs";
import DishSingleSelect from "./DishSingleSelect";
import DishesTable from "./DishesTable";
import { emptyDishForm } from "./nomenclatureConfig";
import { buildNomenclatureProductPayload, mapNomenclatureProduct } from "./nomenclatureData";

vi.mock("../../api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

afterEach(cleanup);

function Drawer({ editing, saving = false, saveDish = vi.fn(), unitOptions = [], printerOptions = [] }) {
  const [form, setForm] = useState(editing || { ...emptyDishForm });
  return <DishesDialogs drawerOpen editing={editing} saving={saving}
    form={form} setForm={setForm} saveDish={saveDish}
    setDrawerOpen={vi.fn()} handlePhotoChange={vi.fn()} unitOptions={unitOptions}
    printerOptions={printerOptions}
    modGroups={[]} setModGroups={vi.fn()} saveModGroup={vi.fn()} removeModGroup={vi.fn()} />;
}

describe("Dishes drawer switches", () => {
  it("renders the canonical money string without mutating the row", () => {
    const row = { id: "dish-1", cost: "12 000 UZS", price: "40 000 UZS" };
    render(<DishesTable filteredRows={[row]} isColumnVisible={(key) => ["cost", "price"].includes(key)} tableMinWidth={600} />);
    // V22: единый показ денег — строка уже отформатирована
    // mapNomenclatureProduct/formatNomenclatureMoneyDisplay, таблица её не
    // переписывает (иначе parseNomenclatureMoney не сможет прочитать значение
    // при открытии карточки на редактирование).
    expect(screen.getByText("12 000 сум")).toBeInTheDocument();
    expect(screen.getByText("40 000 сум")).toBeInTheDocument();
    expect(row).toEqual({ id: "dish-1", cost: "12 000 UZS", price: "40 000 UZS" });
  });
  // V28: категория блюда — отдельная колонка, значение из category_name.
  it("shows the dish category in its own column with a dash when empty", () => {
    const rows = [
      mapNomenclatureProduct({ id: "d1", name: "Плов", category_name: "Горячие блюда" }),
      mapNomenclatureProduct({ id: "d2", name: "Чай" }),
    ];
    render(<DishesTable filteredRows={rows} isColumnVisible={() => true} tableMinWidth={900} />);
    expect(screen.getByRole("columnheader", { name: "Категория" })).toBeInTheDocument();
    expect(screen.getByText("Горячие блюда")).toBeInTheDocument();
    expect(screen.getByText("Чай").closest("tr").querySelector(".dish-category-empty")).not.toBeNull();
  });
  it.each(["Ед. изм", "Категория", "Принтер"])("reuses the Reports leading selection square for %s", (label) => {
    const onChange = vi.fn();
    render(<DishSingleSelect label={label} value="a" onChange={onChange}
      options={[{ value: "a", label: "Первый" }, { value: "b", label: "Второй" }]} />);
    fireEvent.click(screen.getByRole("combobox", { name: label }));
    const selected = screen.getByRole("option", { name: "Первый" });
    const unselected = screen.getByRole("option", { name: "Второй" });
    expect(selected).toHaveClass("is-checked");
    expect(selected.firstElementChild).toHaveClass("owner-msel__check");
    expect(selected.querySelector(".owner-msel__tick")).not.toBeNull();
    expect(unselected.querySelector(".owner-msel__check")).not.toBeNull();
    expect(unselected.querySelector(".owner-msel__tick")).toBeNull();
    expect(screen.getByRole("listbox")).not.toHaveAttribute("aria-multiselectable", "true");
    fireEvent.click(unselected);
    expect(onChange).toHaveBeenCalledWith("b");
  });
  it.each([undefined, { ...emptyDishForm, id: "dish-1", active: false, auto: true }])(
    "shows only status and hides add-ons/auto/set controls in create/edit", (editing) => {
      render(<Drawer editing={editing} />);
      expect(screen.queryByText("Меню")).not.toBeInTheDocument();
      expect(screen.queryByText("Добавки")).not.toBeInTheDocument();
      expect(screen.queryByText("Добавить группу")).not.toBeInTheDocument();
      expect(screen.getAllByRole("switch")).toHaveLength(1);
      const status = screen.getByRole("switch", { name: "Статус" });
      expect(screen.queryByRole("switch", { name: "АВТО" })).toBeNull();
      expect(screen.queryByRole("switch", { name: "СЕТ" })).toBeNull();
      expect(status).toHaveAttribute("aria-checked", String(editing?.active !== false));
      fireEvent.click(status);
      expect(screen.getByText(editing ? "Активен" : "Неактивен")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: editing ? "Сохранить" : "Добавить", exact: true })).toBeInTheDocument();
    },
  );

  it("disables switches during save", () => {
    render(<Drawer saving />);
    for (const control of screen.getAllByRole("switch")) expect(control).toBeDisabled();
  });

  it("preserves saved hidden AUTO/SET flags when editing and saving", () => {
    const saved = vi.fn();
    function PreservedDrawer() {
      const [form, setForm] = useState({ ...emptyDishForm, id: "existing-set", name: "Комбо", auto: true, set: true });
      return <DishesDialogs drawerOpen editing={{ id: "existing-set" }} form={form} setForm={setForm}
        saveDish={() => saved(buildNomenclatureProductPayload(form))}
        setDrawerOpen={vi.fn()} handlePhotoChange={vi.fn()} />;
    }
    render(<PreservedDrawer />);
    fireEvent.click(screen.getByRole("switch", { name: "Статус" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить", exact: true }));
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ is_auto: true, is_set: true, is_active: false }));
  });

  it("uses the printer dropdown pattern for real unit labels without a choose-unit option", () => {
    render(<Drawer unitOptions={[{ id: "unit-32", label: "32", active: true }]} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Ед. изм" }));
    expect(screen.queryByText("Выберите единицу")).not.toBeInTheDocument();
    const option = screen.getByRole("option", { name: "32" });
    fireEvent.click(option);
    expect(screen.getByRole("combobox", { name: "Ед. изм" })).toHaveTextContent("32");
  });

  it("starts with empty money inputs and a zero-price placeholder for direct typing", () => {
    render(<Drawer />);
    const inputs = screen.getAllByPlaceholderText("0 сум");
    expect(inputs).toHaveLength(2);
    for (const input of inputs) expect(input).toHaveValue("");
    fireEvent.change(inputs[0], { target: { value: "12500" } });
    fireEvent.change(inputs[1], { target: { value: "40000" } });
    expect(inputs[0]).toHaveValue("12 500");
    expect(inputs[1]).toHaveValue("40 000");
    expect(buildNomenclatureProductPayload(emptyDishForm)).toMatchObject({ cost_price: 0, price: 0 });
  });

  it("groups existing amounts, pasted values and decimals without changing their payload", () => {
    render(<Drawer editing={{ ...emptyDishForm, cost: "12000", price: "40000" }} />);
    const [cost, price] = screen.getAllByPlaceholderText("0 сум");
    expect(cost).toHaveValue("12 000");
    expect(price).toHaveValue("40 000");
    fireEvent.change(price, { target: { value: "345990" } });
    expect(price).toHaveValue("345 990");
    fireEvent.change(cost, { target: { value: "12345,50" } });
    expect(cost).toHaveValue("12 345,50");
    expect(buildNomenclatureProductPayload({ ...emptyDishForm, cost: cost.value, price: price.value }))
      .toMatchObject({ cost_price: 12345.5, price: 345990 });
    fireEvent.change(price, { target: { value: "" } });
    expect(price).toHaveValue("");
  });

  // MONEY-DIGITS-01: в поле суммы нельзя ввести буквы — значение фильтруется
  // и перегруппируется, а не уходит в payload как есть.
  it("accepts digits only and strips letters from money inputs", () => {
    render(<Drawer />);
    const [cost, price] = screen.getAllByPlaceholderText("0 сум");

    fireEvent.change(price, { target: { value: "EFOIEWHFiWEJ" } });
    expect(price).toHaveValue("");
    expect(buildNomenclatureProductPayload({ ...emptyDishForm, price: price.value }).price).toBe(0);

    fireEvent.change(cost, { target: { value: "GYFTUFYUGUI; сум" } });
    expect(cost).toHaveValue("");
    expect(buildNomenclatureProductPayload({ ...emptyDishForm, cost: cost.value }).cost_price).toBe(0);

    // Смешанный ввод и вставка: остаются только цифры, разряды группируются.
    fireEvent.change(price, { target: { value: "12abc34" } });
    expect(price).toHaveValue("1 234");
    fireEvent.change(price, { target: { value: "12 000 сум" } });
    expect(price).toHaveValue("12 000");
    expect(buildNomenclatureProductPayload({ ...emptyDishForm, price: price.value }).price).toBe(12000);

    // Минус и прочие знаки отбрасываются, а не превращают поле в мусор.
    fireEvent.change(cost, { target: { value: "-5000" } });
    expect(cost).toHaveValue("5 000");
    expect(buildNomenclatureProductPayload({ ...emptyDishForm, cost: cost.value }).cost_price).toBe(5000);
  });

  it("keeps the caret next to the edited digit when inserting in the middle", () => {
    render(<Drawer editing={{ ...emptyDishForm, price: "40000" }} />);
    const price = screen.getAllByPlaceholderText("0 сум")[1];
    price.focus();
    fireEvent.change(price, { target: { value: "490 000", selectionStart: 2, selectionEnd: 2 } });
    expect(price).toHaveValue("490 000");
    expect(price.selectionStart).toBe(2);
  });

  it("shows a decorative сум suffix only for filled inputs, without adding it to the value", () => {
    render(<Drawer />);
    const [cost] = screen.getAllByPlaceholderText("0 сум");
    expect(screen.queryByText("сум", { exact: true })).not.toBeInTheDocument();
    fireEvent.change(cost, { target: { value: "223423" } });
    expect(cost).toHaveValue("223 423");
    expect(cost.parentElement.querySelector(".dish-money-measure").parentElement)
      .toHaveClass("dish-money-measure-clip");
    expect(screen.getByText("сум", { exact: true })).toHaveAttribute("aria-hidden", "true");
    expect(buildNomenclatureProductPayload({ ...emptyDishForm, cost: cost.value }).cost_price).toBe(223423);
    fireEvent.change(cost, { target: { value: "" } });
    expect(screen.queryByText("сум", { exact: true })).not.toBeInTheDocument();
  });

  it.each([false, true])("preserves all three flags in create/update payloads (%s)", (isUpdate) => {
    const row = mapNomenclatureProduct({ id: "dish-1", is_active: false, is_auto: true, is_set: false });
    expect(row).toMatchObject({ active: false, auto: true, set: false });
    // Канонические имена backend-флагов — is_active/is_auto/is_set
    // (ProductCreate/ProductUpdate); `set` — только внутреннее поле формы.
    expect(buildNomenclatureProductPayload({ ...emptyDishForm, ...row }, { isUpdate }))
      .toMatchObject({ is_active: false, is_auto: true, is_set: false });
  });

  it("unchecks selected option on repeat click (toggle off)", () => {
    const onChange = vi.fn();
    render(<DishSingleSelect label="Категория" value="a" onChange={onChange}
      options={[{ value: "a", label: "Первый" }, { value: "b", label: "Второй" }]} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Категория" }));
    fireEvent.click(screen.getByRole("option", { name: "Первый" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("opens centered enlarged photo on table photo click", async () => {
    render(
      <DishesTable
        filteredRows={[{ id: "d1", sort: "1", name: "Лаваш", photo: "http://img/p.jpg", unit: "шт", ingredientsCount: 0 }]}
        isColumnVisible={() => true}
        tableMinWidth={600}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Открыть фото Лаваш" }));
    const dialog = screen.getByRole("dialog", { name: "Фото блюда Лаваш" });
    expect(dialog.querySelector("img")).toHaveAttribute("src", "http://img/p.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Закрыть фото" }));
    // Уход той же анимацией, что приход: слой живёт с is-closing 160ms.
    expect(document.querySelector(".dish-photo-viewer-layer.is-closing")).not.toBeNull();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Фото блюда Лаваш" })).toBeNull());
  });

  it("hides kind switch in edit mode", () => {
    render(<Drawer editing={{ ...emptyDishForm, id: "d1", name: "Лаваш" }} />);
    expect(screen.queryByRole("tablist", { name: "Тип позиции" })).toBeNull();
    // Раскладка правки — обычное блюдо, тумблеры на месте.
    expect(screen.getByText("Себестоимость")).toBeInTheDocument();
    expect(screen.getAllByRole("switch")).toHaveLength(1);
  });

  it("shows Сет instead of Рецепты badge for set rows", () => {
    render(
      <DishesTable
        filteredRows={[
          { id: "s1", sort: "1", name: "Комбо", photo: "", unit: "шт", ingredientsCount: 0, set: true },
          { id: "d1", sort: "2", name: "Лаваш", photo: "", unit: "шт", ingredientsCount: 0, set: false },
        ]}
        isColumnVisible={() => true}
        tableMinWidth={600}
      />
    );
    const setRow = screen.getByText("Комбо").closest("tr");
    expect(within(setRow).getByText("Сет")).toBeInTheDocument();
    // Иконка слева от текста, как у Рецептов.
    expect(setRow.querySelector(".dish-set-text .dish-recipe-icon")).not.toBeNull();
    expect(within(setRow).queryByText("Рецепты")).toBeNull();
    const dishRow = screen.getByText("Лаваш").closest("tr");
    expect(within(dishRow).getByText("Рецепты")).toBeInTheDocument();
    expect(within(dishRow).queryByText("Сет")).toBeNull();
  });

  it("has no СЕТ column toggle in dishes table", () => {
    render(
      <DishesTable
        filteredRows={[
          { id: "d1", sort: "1", name: "Лаваш", photo: "", unit: "шт", ingredientsCount: 0, set: false, allowInSets: false },
        ]}
        isColumnVisible={() => true}
        tableMinWidth={600}
        updateRow={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "В сеты для Лаваш" })).toBeNull();
    expect(document.body.querySelector(".dish-col-set")).toBeNull();
  });

  it("opens set composition from Сет button with count", () => {
    const onOpenSet = vi.fn();
    render(
      <DishesTable
        filteredRows={[
          { id: "s1", sort: "1", name: "Комбо", photo: "", unit: "шт", ingredientsCount: 0, setItemsCount: 2, set: true },
        ]}
        isColumnVisible={() => true}
        tableMinWidth={600}
        onOpenSet={onOpenSet}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Открыть сет Комбо" }));
    expect(onOpenSet).toHaveBeenCalledTimes(1);
    expect(onOpenSet.mock.calls[0][0]).toMatchObject({ id: "s1" });
    expect(screen.getByText("Сет (2 шт)")).toBeInTheDocument();
  });

  it("keeps native picker for photo-less rows", () => {
    const clickSpy = vi.spyOn(window.HTMLInputElement.prototype, "click").mockImplementation(() => {});
    render(
      <DishesTable
        filteredRows={[{ id: "d1", sort: "1", name: "Лаваш", photo: "", unit: "шт", ingredientsCount: 0 }]}
        isColumnVisible={() => true}
        tableMinWidth={600}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Выбрать фото для Лаваш" }));
    expect(clickSpy).toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Фото блюда Лаваш" })).toBeNull();
    clickSpy.mockRestore();
  });

  it("deletes dish photo through confirm panel", async () => {
    api.patch.mockResolvedValue({ data: {} });
    render(<Drawer editing={{ id: "d1", name: "Лаваш", photo: "http://img/p.jpg" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Удалить фото блюда" }));
    expect(screen.getByRole("dialog", { name: "Удалить фото блюда" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      "/inventory/products/d1",
      { image_url: null },
    ));
    await waitFor(() => expect(
      screen.queryByRole("button", { name: "Удалить фото блюда" }),
    ).toBeNull());
  });

  it("shows Блюдо|Сет switch with dish layout by default", () => {
    render(<Drawer />);
    const tabs = screen.getByRole("tablist", { name: "Тип позиции" });
    expect(within(tabs).getByRole("tab", { name: "Блюдо" })).toHaveClass("is-active");
    expect(within(tabs).getByRole("tab", { name: "Сет" })).not.toHaveClass("is-active");
    expect(screen.getByText("Себестоимость")).toBeInTheDocument();
    // Поля Тип больше нет: на его месте Категория.
    expect(screen.queryByText("Тип")).toBeNull();
  });

  it("set mode drops cost/type and rearranges to price/category/unit/printer", () => {
    render(<Drawer />);
    fireEvent.click(screen.getByRole("tab", { name: "Сет" }));
    expect(screen.getByRole("tab", { name: "Сет" })).toHaveClass("is-active");
    expect(screen.queryByText("Себестоимость")).toBeNull();
    expect(screen.queryByText("Тип")).toBeNull();
    expect(screen.getByLabelText("Цена")).toBeInTheDocument();
    for (const name of ["Категория", "Ед. изм", "Принтер"]) {
      expect(screen.getByRole("combobox", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(screen.queryByRole("switch", { name: "СЕТ" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Блюдо" }));
    expect(screen.getByRole("tab", { name: "Блюдо" })).toHaveClass("is-active");
    expect(screen.getByText("Себестоимость")).toBeInTheDocument();
  });

  it("edits a set item in set layout without kind switch", () => {
    render(<Drawer editing={{ ...emptyDishForm, id: "d1", set: true }} />);
    expect(screen.getByRole("heading", { name: "Редактировать сет" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "Тип позиции" })).toBeNull();
    expect(screen.queryByText("Себестоимость")).toBeNull();
    expect(screen.getByLabelText("Цена")).toBeInTheDocument();
  });

  it("hides Блюдо|Сет switch and СЕТ toggle when hideKindSwitch (Товары)", () => {
    const [form, setForm] = [{ ...emptyDishForm }, vi.fn()];
    render(<DishesDialogs drawerOpen saving={false}
      form={form} setForm={setForm} saveDish={vi.fn()}
      setDrawerOpen={vi.fn()} handlePhotoChange={vi.fn()} unitOptions={[]}
      printerOptions={[]} hideKindSwitch />);
    expect(screen.getByRole("heading", { name: "Добавить блюдо" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "Тип позиции" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Сет" })).toBeNull();
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(screen.queryByRole("switch", { name: "СЕТ" })).toBeNull();
  });

  it("dish layout has no Тип, category in its place and exactly one printer", () => {
    render(<Drawer />);
    expect(screen.queryByText("Тип")).toBeNull();
    expect(screen.getByText("Себестоимость")).toBeInTheDocument();
    // Принтер один: второй селект был copy-paste и дублировал то же поле.
    expect(screen.getAllByRole("combobox", { name: "Принтер" })).toHaveLength(1);
  });

  it("printer select edits the dish printer", () => {
    render(<Drawer printerOptions={[{ id: "p1", name: "Первый", active: true }]} />);
    const printer = screen.getByRole("combobox", { name: "Принтер" });
    fireEvent.click(printer);
    fireEvent.click(screen.getByRole("option", { name: "Первый" }));
    expect(printer).toHaveTextContent("Первый");
  });

  it("keeps switch in header row and flips title to Добавить сет", () => {
    render(<Drawer />);
    // Drawer портирован в body — ищем через document.
    const header = document.querySelector(".staff-form__header");
    expect(within(header).getByRole("tablist", { name: "Тип позиции" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Сет" }));
    expect(screen.getByRole("heading", { name: "Добавить сет" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Добавить сет" })).toBeInTheDocument();
  });

  it("slides whole window (photo + fields) from the right into set and back", () => {
    render(<Drawer />);
    const win = () => document.querySelector(".dish-drawer__animated");
    expect(win().getAttribute("data-slide")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Сет" }));
    expect(win().getAttribute("data-slide")).toBe("right");
    // Фото едет вместе с полями своего окна.
    expect(win().querySelector(".cashier-photo")).not.toBeNull();
    expect(win().querySelector(".staff-form__grid")).not.toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Блюдо" }));
    expect(win().getAttribute("data-slide")).toBe("left");
    expect(screen.getByRole("heading", { name: "Добавить блюдо" })).toBeInTheDocument();
  });

  it("slides window slower (450ms) without slide on open", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    expect(css).toMatch(/\.dish-drawer \.dish-drawer__animated\[data-slide="right"\]\s*\{[^}]*animation:[^}]*450ms/);
    expect(css).toMatch(/\.dish-drawer \.dish-drawer__animated\[data-slide="left"\]\s*\{[^}]*animation:[^}]*450ms/);
  });

  it("keeps switch buttons equal width with sliding pill", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
    const sw = css.match(/\.dish-kind-switch button\s*\{[^}]*\}/)?.[0] || "";
    expect(sw).toMatch(/flex:\s*1 1 0/);
    expect(sw).toMatch(/min-width:\s*100px/);
    expect(css).toMatch(/\.dish-kind-switch__indicator\s*\{[^}]*transition:[^}]*transform 250ms/);
    // Свитч отцентрован абсолютно — ширина заголовка его не двигает.
    expect(css).toMatch(/\.dish-drawer \.dish-kind-switch\s*\{[^}]*position:\s*absolute/);
    const label = css.match(/\.dish-drawer \.dish-form-field__label\s*\{[^}]*\}/)?.[0] || "";
    expect(label).toMatch(/font-size:\s*12px/);
    expect(label).toMatch(/color:\s*#64748b/);
    // Бордеры полей темнее.
    expect(css).toMatch(/\.dish-drawer \.staff-form__grid input/);
    expect(css).toMatch(/border-color:\s*rgba\(15,\s*35,\s*60,\s*0\.24\)/);
  });

  it("keeps dropdown panel inline outside recipes dialogs (no detach)", () => {
    render(<DishSingleSelect label="Категория" value="" onChange={vi.fn()}
      options={[{ value: "a", label: "Первый" }]} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Категория" }));
    const panel = document.querySelector(".orders-filter-select__panel:not(.is-closing)");
    expect(panel).not.toBeNull();
    expect(panel).not.toHaveClass("is-detached");
  });
});
