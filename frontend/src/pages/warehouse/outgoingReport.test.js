import { describe, expect, it } from "vitest";
import { readOutgoingReport } from "./outgoingReport";

describe("outgoing movement timestamp display", () => {
  it.each([
    ["2026-10-20T05:33:23.348745+00:00", "20.10.2026 / 10:33"],
    ["2026-10-20T10:33:23+05:00", "20.10.2026 / 10:33"],
    ["2026-10-20T19:00:00Z", "21.10.2026 / 00:00"],
    [null, "—"],
  ])("formats %s in fixed UTC+5 without changing money", (registeredAt, expected) => {
    const report = readOutgoingReport({ rows: [{ product: 220000, tovar: 0, raw: 220000 }],
      lines: [{ registeredAt, sum: 220000, qty: 2 }], total: 220000 });
    expect(report.lines[0].registeredAt).toBe(expected);
    expect(report.total).toBe(220000);
  });
});
