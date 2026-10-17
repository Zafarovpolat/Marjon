import { api } from "./client";
import { normalizeTokenResponse } from "./normalizers";
import { saveAuthTokens } from "../auth/session";

export const authService = Object.freeze({
  getCurrentUser(config) {
    return config ? api.get("/auth/me", config) : api.get("/auth/me");
  },
  async changePassword(payload) {
    const response = await api.post("/auth/change-password", payload);
    const tokens = normalizeTokenResponse(response.data, { requireRefreshToken: true });
    saveAuthTokens(tokens);
    return response;
  },
});
