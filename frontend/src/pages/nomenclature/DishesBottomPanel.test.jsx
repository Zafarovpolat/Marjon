import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(`${process.cwd()}/src/styles/owner/dishes.css`, "utf8");
const rules = (selector) => [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([, selectors]) => selectors.trim() === selector).map(([, , body]) => body);

describe("Dishes bottom shell spacing", () => {
  it("adds a small 12px gap only to the outer card, including mobile", () => {
    const cards = rules(".dish-catalog-page.owner-report-view .dish-catalog-card");
    expect(cards.some((body) => /padding-bottom:\s*12px/.test(body))).toBe(true);
    expect(cards.some((body) => /padding:\s*16px 16px 12px/.test(body))).toBe(true);
    expect(cards).not.toContainEqual(expect.stringMatching(/padding-bottom:\s*0\s*;/));
  });
  it("retains intrinsic height, clipping, inner scroll and no fake end reserve", () => {
    const card = rules(".dish-catalog-page.owner-report-view .dish-catalog-card").join("\n");
    expect(card).toMatch(/flex:\s*0 1 auto/);
    expect(card).toMatch(/height:\s*auto/);
    expect(card).toMatch(/max-height:\s*100%/);
    const scroll = [...rules(".dish-catalog-page.owner-report-view .dish-grid-scroll"),
      ...rules(".dish-catalog-page.owner-report-view .dish-grid-wrap:not(.is-empty) .dish-grid-scroll")].join("\n");
    expect(scroll).toMatch(/overflow-y:\s*auto/);
    expect(scroll).toMatch(/padding-bottom:\s*0/);
    expect(scroll).toMatch(/scrollbar-width:\s*none/);
    const wrap = rules(".dish-catalog-page.owner-report-view .dish-grid-wrap").join("\n");
    expect(wrap).toMatch(/overflow:\s*hidden/);
    expect(wrap).toMatch(/flex:\s*0 1 auto/);
    expect(css).not.toMatch(/padding-bottom:\s*48px/);
  });
});
