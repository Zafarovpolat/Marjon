import { describe, expect, it } from "vitest";
import { categoryBelongsToKind } from "./catalogCategories";

describe("catalog category namespace", () => {
  it.each([
    ["dish-food", "dish", true], ["old-food", "dish", true], ["", "dish", true],
    ["sales-drinks", "dish", false], ["raw-food", "dish", false], ["semi-food", "dish", false],
    ["sales-drinks", "sales", true], ["dish-food", "sales", false], ["old-food", "sales", false],
    ["raw-food", "raw", true], ["semi-food", "semi", true], ["sales-drinks", "raw", false],
  ])("%s belongs to %s: %s", (slug, kind, expected) => {
    expect(categoryBelongsToKind({ slug }, kind)).toBe(expected);
  });
  it("does not include an absent category", () => {
    expect(categoryBelongsToKind(null, "dish")).toBe(false);
  });
});
