import { describe, expect, it } from "vitest";
import {
  formatPhoneDisplay,
  formatTablePhone,
  normalizePhoneForPayload,
  parsePhoneInput,
  phoneDigits,
} from "./phone";

describe("counterparty phone assistance", () => {
  it("extracts digits", () => {
    expect(phoneDigits("+998 90 123-45-67")).toBe("998901234567");
    expect(phoneDigits("")).toBe("");
  });

  it("keeps a leading plus marker for international numbers", () => {
    expect(parsePhoneInput("+1 415 555 0132")).toBe("+14155550132");
    expect(parsePhoneInput("90 123 45 67")).toBe("901234567");
    expect(parsePhoneInput("")).toBe("");
  });

  it("normalizes the payload value or null", () => {
    expect(normalizePhoneForPayload("")).toBeNull();
    expect(normalizePhoneForPayload("  ")).toBeNull();
    expect(normalizePhoneForPayload("901234567")).toBe("+998901234567");
    expect(normalizePhoneForPayload("998901234567")).toBe("+998901234567");
    expect(normalizePhoneForPayload("+14155550132")).toBe("+14155550132");
    expect(normalizePhoneForPayload("12345")).toBe("12345");
  });

  it("formats canonical Uzbek numbers for display", () => {
    expect(formatPhoneDisplay("+998901234567")).toBe("+998 90 123 45 67");
    expect(formatPhoneDisplay("+14155550132")).toBe("+14155550132");
    expect(formatPhoneDisplay("")).toBe("");
  });

  it("masks canonical UZ numbers for the main table only", () => {
    expect(formatTablePhone("+998900078779")).toBe("+998 (90) 007-87-79");
    expect(formatTablePhone("+998901112233")).toBe("+998 (90) 111-22-33");
    expect(formatTablePhone("998901112233")).toBe("+998 (90) 111-22-33");
  });

  it("passes legacy and international values through byte-identical", () => {
    expect(formatTablePhone("23423423423")).toBe("23423423423");
    expect(formatTablePhone("+14155552671")).toBe("+14155552671");
    expect(formatTablePhone("12345")).toBe("12345");
    expect(formatTablePhone("")).toBe("");
    expect(formatTablePhone(null)).toBe("");
  });
});
