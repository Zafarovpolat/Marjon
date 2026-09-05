import { describe, expect, it } from "vitest";

import { organizationErrorMessage } from "./organizationErrors";

describe("organizationErrorMessage", () => {
  it("keeps a bounded backend detail", () => {
    expect(organizationErrorMessage({ detail: "Конфликт данных" }, "Ошибка")).toBe("Конфликт данных");
  });

  it("extracts validation messages without exposing rejected input", () => {
    const message = organizationErrorMessage({
      detail: [{ msg: "Название уже используется", input: "private-value" }],
    }, "Ошибка");
    expect(message).toBe("Название уже используется");
    expect(message).not.toContain("private-value");
  });

  it("hides internal contract errors behind the feature fallback", () => {
    expect(organizationErrorMessage({
      name: "ApiContractError",
      code: "INVALID_PAGINATED_LIST_RESPONSE",
      message: "internal contract detail",
    }, "Не удалось загрузить организации.")).toBe("Не удалось загрузить организации.");
  });

  it("rejects an unbounded backend message", () => {
    expect(organizationErrorMessage({ detail: "x".repeat(241) }, "Безопасная ошибка")).toBe("Безопасная ошибка");
  });
});
