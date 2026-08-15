import { describe, expect, it } from "vitest";
import { formatLocalPhone, getLocalPhoneDigits } from "./LoginPage";

// Regression coverage for the +998 local-phone parsing bug: the field renders
// the "+998" country code separately and only holds the 9 local digits. A local
// number that itself begins with "998" (or an incremental "998…" while typing)
// must NOT be mistaken for the country prefix and stripped.
describe("getLocalPhoneDigits", () => {
  it("keeps a plain 9-digit local number untouched", () => {
    expect(getLocalPhoneDigits("907778778")).toBe("907778778");
  });

  it("keeps a 9-digit local number that itself begins with 998", () => {
    expect(getLocalPhoneDigits("998112233")).toBe("998112233");
  });

  it("preserves an in-progress '998…' local number while typing", () => {
    expect(getLocalPhoneDigits("998")).toBe("998");
    expect(getLocalPhoneDigits("9981")).toBe("9981");
    expect(getLocalPhoneDigits("99811")).toBe("99811");
  });

  it("clamps (does not strip) over-typing of a full 998 local number", () => {
    // A completed 998-local number (99 811-22-33) with an extra digit is 10
    // digits — still a local number, so the surplus is clamped, not stripped.
    expect(getLocalPhoneDigits("9981122335")).toBe("998112233");
    // 11 digits stays in the local band too.
    expect(getLocalPhoneDigits("99811223355")).toBe("998112233");
  });

  it("clamps over-typing of a plain (non-998) local number, independent of the 998 branch", () => {
    expect(getLocalPhoneDigits("9012345678")).toBe("901234567");
    expect(getLocalPhoneDigits("90123456789")).toBe("901234567");
  });

  it("strips the country prefix only for an international-length input", () => {
    // Pasting the full canonical OWNER number keeps just the 9 local digits.
    expect(getLocalPhoneDigits("998907778778")).toBe("907778778");
  });

  it("strips only the country 998 from a full number whose local part also starts with 998", () => {
    // "998" (country) + "998112233" (local) → the local 998 must survive.
    expect(getLocalPhoneDigits("998998112233")).toBe("998112233");
  });

  it("strips a formatted international paste with separators", () => {
    expect(getLocalPhoneDigits("+998 90 777 87 78")).toBe("907778778");
  });

  it("strips non-digits and clamps to 9 local digits", () => {
    expect(getLocalPhoneDigits("90a12b34567890")).toBe("901234567");
  });

  it("treats empty / nullish input as an empty string", () => {
    expect(getLocalPhoneDigits("")).toBe("");
    expect(getLocalPhoneDigits(null)).toBe("");
    expect(getLocalPhoneDigits(undefined)).toBe("");
  });
});

describe("formatLocalPhone", () => {
  it("formats a full local number as NN NNN-NN-NN", () => {
    expect(formatLocalPhone("907778778")).toBe("90 777-87-78");
  });

  it("formats a '998…' local number without stripping it", () => {
    expect(formatLocalPhone("998112233")).toBe("99 811-22-33");
  });

  it("formats partial input progressively", () => {
    expect(formatLocalPhone("9")).toBe("9");
    expect(formatLocalPhone("90")).toBe("90");
    expect(formatLocalPhone("901")).toBe("90 1");
    expect(formatLocalPhone("90123")).toBe("90 123");
    expect(formatLocalPhone("9012345")).toBe("90 123-45");
    expect(formatLocalPhone("901234567")).toBe("90 123-45-67");
  });

  it("formats a canonical international paste as the local number", () => {
    expect(formatLocalPhone("998907778778")).toBe("90 777-87-78");
  });
});
