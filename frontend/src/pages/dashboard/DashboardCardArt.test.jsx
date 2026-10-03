import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// DASHBOARD MAXIMAL KPI CARDS V1 — focused visual-mapping guards.
// Decorative-only PNG art: real values stay DOM text, art is aria-hidden.
// No business logic, no Period V5, no API assertions here.

const ART_DIR = `${process.cwd()}/src/assets/dashboard-card-art`;

const EXPECTED_ASSETS = [
  "revenue.png",
  "orders.png",
  "average_check.png",
  "income.png",
  "expense.png",
  "incoming_goods.png",
  "outgoing_goods.png",
  "warehouse_stock.png",
  "total_costs.png",
  "accounts_payable.png",
  "accounts_receivable.png",
];

// Right-side cards render cleaned derivatives (same family, explicit names);
// originals stay untouched on disk.
const CLEANED_ASSETS = [
  "incoming_goods_clean.png",
  "outgoing_goods_clean.png",
  "warehouse_stock_clean.png",
  "total_costs_clean.png",
  "accounts_payable_clean.png",
  "accounts_receivable_clean.png",
];

describe("DASHBOARD MAXIMAL KPI CARDS V1 art mapping", () => {
  it("has all 11 PNG assets in the dedicated folder (no ZIP, no regen)", () => {
    for (const file of EXPECTED_ASSETS) {
      expect(existsSync(`${ART_DIR}/${file}`), `missing asset: ${file}`).toBe(true);
    }
  });

  it("imports all 11 assets through the bundler (no remote URLs, no base64)", () => {
    const source = readFileSync(`${process.cwd()}/src/pages/OwnerDashboard.jsx`, "utf8");
    for (const file of ["revenue.png", "orders.png", "average_check.png", "income.png", "expense.png"]) {
      expect(source).toContain(`../assets/dashboard-card-art/${file}`);
    }
    for (const file of CLEANED_ASSETS) {
      expect(existsSync(`${ART_DIR}/${file}`), `missing cleaned asset: ${file}`).toBe(true);
      expect(source).toContain(`../assets/dashboard-card-art/${file}`);
    }
    expect(source).not.toMatch(/dashboard-card-art.*https?:/);
    expect(source).not.toContain("data:image");
  });

  it("maps every top KPI variant and every right-side tone", () => {
    const source = readFileSync(`${process.cwd()}/src/pages/OwnerDashboard.jsx`, "utf8");
    for (const className of [
      "premium-kpi--revenue",
      "premium-kpi--orders",
      "premium-kpi--avg",
      "premium-kpi--tables",
      "premium-kpi--expense",
    ]) {
      expect(source).toContain(`"${className}"`);
    }
    for (const tone of ["income", "expense", "stock", "costs", "creditor", "debtor"]) {
      expect(source).toContain(`${tone}: { src:`);
    }
  });

  it("renders art as decorative only (alt, aria-hidden, no pointer interception)", () => {
    const source = readFileSync(`${process.cwd()}/src/pages/OwnerDashboard.jsx`, "utf8");
    expect(source).toContain('className="dashboard-kpi-card__art"');
    expect(source).toContain('className="dashboard-side-metric__art"');
    expect(source).toContain('alt=""');
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain("draggable={false}");
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dashboard.css`, "utf8");
    expect(css).toContain("dashboard-kpi-card__art");
    expect(css).toContain("dashboard-side-metric__art");
    expect(css).toMatch(/dashboard-kpi-card__art\s*\{[^}]*pointer-events:\s*none/s);
    expect(css).toMatch(/dashboard-side-metric__art\s*\{[^}]*pointer-events:\s*none/s);
    expect(css).toMatch(/dashboard-kpi-card__art\s*\{[^}]*z-index:\s*0/s);
  });

  it("keeps KPI business content intact (labels, values, badges, period untouched)", () => {
    const source = readFileSync(`${process.cwd()}/src/pages/OwnerDashboard.jsx`, "utf8");
    expect(source).toContain("{kpi.label}");
    expect(source).toContain("{kpi.value}");
    expect(source).toContain("{kpi.badge}");
    expect(source).toContain("applyDashboardPeriod");
    expect(source).toContain('variant="canonical"');
  });

  it("adds only scoped presentation CSS (no !important, no geometry overrides)", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dashboard.css`, "utf8");
    const block = css.slice(css.indexOf("DASHBOARD VISUAL FINALIZATION V2"));
    expect(block.length).toBeGreaterThan(500);
    expect(block).not.toContain("!important");
    expect(block).not.toMatch(/grid-template-columns/);
    expect(block).not.toMatch(/\.card\s*\{/);
    expect(block).not.toMatch(/report-date-(?:menu|presets|range|calendar|time)/);
  });
});

describe("DASHBOARD VISUAL FINALIZATION V2 premium scale + clean crop", () => {
  it("uses premium-scale artwork (KPI 76-92px, side art fully visible)", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dashboard.css`, "utf8");
    const block = css.slice(css.indexOf("DASHBOARD VISUAL FINALIZATION V2"));
    expect(block.length).toBeGreaterThan(500);
    for (const width of ["width: 92px", "width: 76px", "width: 82px", "width: 88px", "width: 78px"]) {
      expect(block).toContain(width);
    }
    expect(block).toContain("max-width: 40%");
  });

  it("shows the whole right-side PNG with no harsh crop (V3.1)", () => {
    const source = readFileSync(`${process.cwd()}/src/pages/OwnerDashboard.jsx`, "utf8");
    expect(source).not.toContain("dashboard-side-card__art-viewport");
    expect(source).toContain('className="dashboard-side-metric__art"');
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dashboard.css`, "utf8");
    const artRule = css.match(/dashboard-side-metric__art\s*\{[^}]*\}/s)?.[0] || "";
    expect(artRule).toMatch(/object-fit:\s*contain/);
    expect(artRule).not.toMatch(/margin-top:\s*-/);
    expect(artRule).toMatch(/pointer-events:\s*none/);
    expect(css).not.toContain("!important");
  });

  it("keeps KPI value readable: smaller, lowered, never crossing the art", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dashboard.css`, "utf8");
    const valueRule = css.match(/dashboard-kpi-card--visual \.kpi-value\s*\{[^}]*\}/s)?.[0] || "";
    expect(valueRule).toMatch(/margin-top:\s*22px/);
    expect(valueRule).toMatch(/max-width:\s*100%/);
    expect(valueRule).not.toMatch(/text-overflow/);
    const source = readFileSync(`${process.cwd()}/src/pages/OwnerDashboard.jsx`, "utf8");
    expect(source).not.toContain("kpi-note ${kpi.noteClass}");
  });

  it("lifts the chart title block and stat cards without touching line design", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dashboard.css`, "utf8");
    expect(css).toContain("DASHBOARD VISUAL REFINEMENT V3.1");
    const headerRule = css.match(/premium-chart \.section-header--stack\s*\{[^}]*\}/s)?.[0] || "";
    expect(headerRule).toMatch(/margin-bottom:\s*4px/);
    const statsRule = css.match(/premium-chart \.revenue-stat-grid\s*\{[^}]*\}/s)?.[0] || "";
    expect(statsRule).toMatch(/margin-top:\s*6px/);
    expect(statsRule).toMatch(/margin-bottom:\s*2px/);
  });
});

describe("DASHBOARD VISUAL REFINEMENT V3.2 precision pass", () => {
  it("sizes KPI values below the later band rule without !important or desktop truncation", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dashboard.css`, "utf8");
    const rule = css.match(/owner-kpi-band \.dashboard-kpi-card--visual\.premium-kpi \.kpi-value\s*\{[^}]*\}/s)?.[0] || "";
    expect(rule).toMatch(/font-size:\s*clamp\(19px, 1\.6vw, 25px\)/);
    expect(rule).toMatch(/margin-top:\s*16px/);
    expect(rule).not.toContain("text-overflow");
    expect(rule).not.toContain("!important");
  });

  it("stretches the plot with net-zero content height (desktop only)", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dashboard.css`, "utf8");
    expect(css).toContain("height: 316px");
    const media = css.match(/@media \(min-width: 1281px\)\s*\{[\s\S]*?owner-main-grid \.premium-chart \.chart-wrap\s*\{[^}]*\}/)?.[0] || "";
    expect(media).toMatch(/height:\s*316px/);
    expect(media).toMatch(/margin-top:\s*16px/);
    const eyebrow = css.match(/premium-chart \.section-header--stack \.eyebrow\s*\{[^}]*\}/s)?.[0] || "";
    expect(eyebrow).toMatch(/margin-bottom:\s*2px/);
  });

  it("wires cleaned right-side assets, originals preserved", () => {
    const source = readFileSync(`${process.cwd()}/src/pages/OwnerDashboard.jsx`, "utf8");
    for (const file of CLEANED_ASSETS) {
      expect(source).toContain(file);
    }
    for (const file of EXPECTED_ASSETS.slice(5)) {
      expect(existsSync(`${ART_DIR}/${file}`)).toBe(true);
    }
  });
});

describe("DASHBOARD REVENUE ANALYTICS LAYOUT REFINEMENT V3.6", () => {
  it("removes the local date line but keeps the period logic mounted", () => {
    const source = readFileSync(`${process.cwd()}/src/pages/OwnerDashboard.jsx`, "utf8");
    expect(source).not.toContain("<p>{dashboardPeriodLabel}</p>");
    // Picker JSX untouched: Period V5 behavior and its tests stay intact.
    expect(source).toContain('className="owner-revenue-switcher"');
    const picker = source.match(/<ReportDateRangePicker[\s\S]*?\/>/)?.[0] || "";
    expect(picker).toContain('variant="canonical"');
    expect(picker).toContain("onOpenChange=");
    expect(picker).toContain("onExitComplete=");
  });

  it("restores the Revenue-local period trigger (V3.6.1): visible again", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/owner/dashboard.css`, "utf8");
    // No hiding rule may remain for the trigger.
    const hiddenRule = css.match(/premium-chart \.owner-revenue-switcher\s*\{[^}]*opacity:\s*0[^}]*\}/s);
    expect(hiddenRule).toBeNull();
    const source = readFileSync(`${process.cwd()}/src/pages/OwnerDashboard.jsx`, "utf8");
    expect(source).toContain('className="owner-revenue-switcher"');
    expect(source).not.toContain("<p>{dashboardPeriodLabel}</p>");
  });
});
