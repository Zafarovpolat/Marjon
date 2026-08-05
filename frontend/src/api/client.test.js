import { afterEach, describe, expect, it, vi } from "vitest";

describe("api client", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("uses VITE_API_URL as the axios base URL", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.marjon.test/api/v1");

    const { API_BASE_URL, api } = await import("./client");

    expect(API_BASE_URL).toBe("https://api.marjon.test/api/v1");
    expect(api.defaults.baseURL).toBe("https://api.marjon.test/api/v1");
  });

  it("normalizes login tokens without changing the request payload", async () => {
    const { api, loginByPhone } = await import("./client");
    const post = vi.spyOn(api, "post").mockResolvedValue({
      data: {
        access_token: "default-access-for-test",
        refresh_token: "default-refresh-for-test",
        token_type: "bearer",
        ignored: true,
      },
    });

    const tokens = await loginByPhone("phone-input", "password-input");

    expect(post).toHaveBeenCalledWith("/auth/login", { phone: "phone-input", password: "password-input" });
    expect(tokens).toEqual({
      access_token: "default-access-for-test",
      refresh_token: "default-refresh-for-test",
      token_type: "bearer",
    });
    expect(localStorage.getItem("access_token")).toBe("default-access-for-test");
    expect(localStorage.getItem("admin_access_token")).toBeNull();
  });
});
