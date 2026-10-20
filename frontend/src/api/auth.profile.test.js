import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";
import { authService } from "./auth";
vi.mock("./client", () => ({ api: { get: vi.fn(), patch: vi.fn() } }));
vi.mock("../auth/session", () => ({ saveAuthTokens: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
describe("server-backed personal profile contract", () => {
  it("posts only display identity as multipart without touching company or credentials", async () => {
    const file = new File(["fixture"], "avatar.webp", { type: "image/webp" });
    await authService.updateProfile({ name: "Анвар", file });
    const [path, body] = api.patch.mock.calls[0];
    expect(path).toBe("/auth/me/profile");
    expect(body).toBeInstanceOf(FormData);
    expect([...body.keys()]).toEqual(["name", "file"]);
    expect(body.get("name")).toBe("Анвар");
    expect(body.get("file")).toBe(file);
  });
  it("fetches a private avatar through the authenticated transport with cancellation", async () => {
    const config = { signal: new AbortController().signal };
    await authService.getProfilePhoto(config);
    expect(api.get).toHaveBeenCalledWith("/auth/me/photo", config);
  });
});
