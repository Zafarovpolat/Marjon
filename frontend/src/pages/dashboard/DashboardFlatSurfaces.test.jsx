import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Dashboard flat resting surfaces", () => {
  const css = readFileSync(`${process.cwd()}/src/styles/owner/dashboard.css`, "utf8");
  const rules = css.slice(css.indexOf("/* Dashboard-only flat resting surfaces."));

  it("keeps 16px above the lower cards and 14px between them across all breakpoints", () => {
    const spacingRules = [...css.matchAll(/body\.dashboard-body \.dashboard-shell \.owner-widgets\s*\{([^}]+)\}/g)];
    expect(spacingRules).toHaveLength(3);
    for (const [, declarations] of spacingRules) {
      expect(declarations).toMatch(/margin-top:\s*16px/);
      expect(declarations).toMatch(/\bgap:\s*14px/);
    }
  });

  it("retains the original OWNER canvas background without a Dashboard-specific color override", () => {
    expect(css).toMatch(/body\.dashboard-body \.dashboard-shell \.dashboard-content\s*\{\s*background:\s*#E9F0FA/);
    expect(rules).not.toMatch(/background\s*:/);
  });

  it("removes resting shadows only while Dashboard is mounted and preserves hover/keyboard focus", () => {
    expect(rules).toContain("body.dashboard-body:has(.dashboard-shell .dashboard-main .dashboard-content > .owner-kpi-band) :not(:hover):not(:focus-visible)");
    expect(rules).toContain("box-shadow: none");
    expect(rules).toContain("text-shadow: none");
    expect(rules).not.toMatch(/!important|outline:\s*none|filter:\s*none/);
  });
});
