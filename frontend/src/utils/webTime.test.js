import { afterEach, describe, expect, it, vi } from "vitest";
import { parseWebInstant, webCalendarToday, webDateTime, webDayKey, webTime, webDateTimeInput, parseWebDateTimeInput } from "./webTime";
import { todayInputValue } from "./date";
import { currentMonthRange, formatDate } from "../pages/finance/financeTransactionsData";

afterEach(() => vi.useRealTimers());
describe("OWNER web fixed UTC+5", () => {
  it("roundtrips a Tashkent editor wall clock without device timezone", () => {
    expect(webDateTimeInput("2026-10-20T05:33:23Z")).toBe("2026-10-20T10:33");
    expect(parseWebDateTimeInput("2026-10-20T10:33").toISOString()).toBe("2026-10-20T05:33:00.000Z");
    expect(parseWebDateTimeInput("")).toBeNull();
  });
  it("converts legacy UTC, Z, offset and naive ISO exactly once", () => {
    for (const value of ["17.10.2026 / 19:15", "2026-10-17T19:15:00Z", "2026-10-18T00:15:00+05:00", "2026-10-17T19:15:00"]) {
      expect(webDayKey(value)).toBe("2026-10-18");
      expect(webDateTime(value)).toBe("18.10.2026 / 00:15");
      expect(formatDate(value)).toBe("18.10.2026 / 00:15");
    }
  });
  it("keeps the exact midnight boundary and year transition", () => {
    expect(webDayKey("2026-10-17T18:59:59Z")).toBe("2026-10-17");
    expect(webDayKey("2026-10-17T19:00:00Z")).toBe("2026-10-18");
    expect(webDayKey("2026-12-31T19:00:00Z")).toBe("2027-01-01");
    expect(webTime("2026-12-31T19:00:00Z")).toBe("00:00");
  });
  it("uses Tashkent today/month even when the device calendar day differs", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-12-31T19:15:00Z"));
    expect(todayInputValue()).toBe("2027-01-01");
    const calendar = webCalendarToday();
    expect([calendar.getFullYear(), calendar.getMonth(), calendar.getDate()]).toEqual([2027, 0, 1]);
    expect(currentMonthRange().start).toBe("01.01.2027");
    expect(currentMonthRange().end).toBe("01.01.2027");
  });
  it("does not fabricate timestamps for missing or invalid values", () => {
    expect(parseWebInstant("bad")).toBeNull();
    expect(webDayKey("")).toBe("");
    expect(webDateTime(null)).toBe("");
    expect(webDayKey("2026-10-18")).toBe("2026-10-18");
  });
});
