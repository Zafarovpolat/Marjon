import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DishesToolbar from "./DishesToolbar";

function renderToolbar(props = {}) {
  const handlers = {
    setDraftFilters: vi.fn(),
    setFilters: vi.fn(),
    ...props.handlers,
  };
  render(
    <DishesToolbar
      draftFilters={{ search: "", category: [] }}
      setDraftFilters={handlers.setDraftFilters}
      setFilters={handlers.setFilters}
      filters={{ search: "", category: [] }}
      filtersOpen
      closeFilters={vi.fn()}
      categoryOptions={[{ id: "c1", name: "Выпечка" }]}
      {...props.rest}
    />
  );
  return handlers;
}

describe("DishesToolbar instant category", () => {
  it("applies category immediately without Фильтровать button", () => {
    const { setFilters, setDraftFilters } = renderToolbar();
    fireEvent.click(screen.getByRole("combobox", { name: "Категория" }));
    fireEvent.click(screen.getByRole("option", { name: "Выпечка" }));
    expect(setFilters).toHaveBeenCalledWith({ search: "", category: ["c1"] });
    expect(setDraftFilters).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Фильтровать/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Очистить/ })).toBeInTheDocument();
  });

  it("keeps applied search when toggling category", () => {
    const { setFilters } = renderToolbar({
      rest: { filters: { search: "лаваш", category: [] } },
    });
    fireEvent.click(screen.getByRole("combobox", { name: "Категория" }));
    fireEvent.click(screen.getByRole("option", { name: "Выпечка" }));
    expect(setFilters).toHaveBeenCalledWith({ search: "лаваш", category: ["c1"] });
  });

  it("applies search text immediately while typing", () => {
    const { setFilters } = renderToolbar({
      rest: { filters: { search: "", category: ["c1"] } },
    });
    fireEvent.change(screen.getByLabelText("Поиск блюд"), { target: { value: "лав" } });
    expect(setFilters).toHaveBeenCalledWith({ search: "лав", category: ["c1"] });
  });
});
