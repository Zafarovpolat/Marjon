import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";
import { saveAuthTokens } from "../auth/session";
import { authService } from "./auth";

vi.mock("./client", () => ({ api: { post: vi.fn() } }));
vi.mock("../auth/session", () => ({ saveAuthTokens: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

describe("self password change API", () => {
  it("replaces current tokens only after a valid successful response", async () => {
    api.post.mockResolvedValueOnce({ data: { access_token: "new-access", refresh_token: "new-refresh" } });
    const payload = { current_password: "Old12345", new_password: "New12345", confirm_password: "New12345" };
    await authService.changePassword(payload);
    expect(api.post).toHaveBeenCalledWith("/auth/change-password", payload);
    expect(saveAuthTokens).toHaveBeenCalledWith({ access_token: "new-access", refresh_token: "new-refresh", token_type: "bearer" });
  });
  it("does not replace tokens on network failure or malformed success", async () => {
    api.post.mockRejectedValueOnce(new Error("offline"));
    await expect(authService.changePassword({})).rejects.toThrow("offline");
    api.post.mockResolvedValueOnce({ data: { access_token: "incomplete" } });
    await expect(authService.changePassword({})).rejects.toThrow();
    expect(saveAuthTokens).not.toHaveBeenCalled();
  });
});
