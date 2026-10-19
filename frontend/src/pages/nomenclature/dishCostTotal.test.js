import { describe, expect, it } from "vitest";
import { mapNomenclatureProduct, matchesDishStatFilter } from "./nomenclatureData";

// Себестоимость = ручная база + состав (вариант A).
// Инвариант: дровер редактирует базу (cost), таблица показывает итог
// (costTotal). Если бы оба читали итог, сохранение записывало бы итог
// обратно в базу и сумма росла бы с каждым открытием карточки.
describe("dish cost = manual base + recipe", () => {
  const base = {
    id: "p1", name: "Плов", price: "54000.00", product_type: "dish",
    cost_price: "21000.00", recipe_cost: "1874.38", cost_total: "22874.38",
    ingredients_count: 2, sort_order: 1,
  };

  it("keeps the editable base separate from the displayed total", () => {
    const row = mapNomenclatureProduct(base, []);
    expect(row.cost.replace(/\s/g, " ")).toBe("21 000 UZS");
    expect(row.costTotal.replace(/\s/g, " ")).toBe("22 874,38 UZS");
    expect(row.recipeCost).toBeCloseTo(1874.38, 2);
  });

  it("falls back to the base when backend does not send a total", () => {
    const row = mapNomenclatureProduct({ ...base, cost_total: null }, []);
    expect(row.costTotal).toBeNull();
    expect(row.cost.replace(/\s/g, " ")).toBe("21 000 UZS");
  });

  it("counts a dish with recipe but empty base as having a cost", () => {
    const row = mapNomenclatureProduct(
      { ...base, cost_price: "0.00", cost_total: "2500.00", recipe_cost: "2500.00" }, [],
    );
    expect(row.cost.replace(/\s/g, " ")).toBe("0 UZS");
    expect(matchesDishStatFilter(row, "orange:0")).toBe(true);
    expect(matchesDishStatFilter(row, "orange:1")).toBe(false);
  });

  it("treats an unknown cost as not set", () => {
    const row = mapNomenclatureProduct(
      { ...base, cost_price: null, cost_total: null, recipe_cost: "0" }, [],
    );
    expect(row.costTotal).toBeNull();
    expect(matchesDishStatFilter(row, "orange:1")).toBe(true);
  });

  it("filters by the numeric total, not by the formatted money string", () => {
    // Формат денег на экране меняется (UZS/сум) — фильтр обязан считать
    // по числу, иначе «Себестоимость указана» молча начнёт врать.
    const zero = mapNomenclatureProduct(
      { ...base, cost_price: "0.00", cost_total: "0.00", recipe_cost: "0" }, [],
    );
    expect(zero.costTotalValue).toBe(0);
    expect(matchesDishStatFilter(zero, "orange:1")).toBe(true);
    const paid = mapNomenclatureProduct(base, []);
    expect(paid.costTotalValue).toBeCloseTo(22874.38, 2);
    expect(matchesDishStatFilter(paid, "orange:0")).toBe(true);
  });
});
