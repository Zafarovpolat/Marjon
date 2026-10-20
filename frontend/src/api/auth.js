import { api } from "./client";
import { normalizeTokenResponse } from "./normalizers";
import { saveAuthTokens } from "../auth/session";

export const authService = Object.freeze({
  getCurrentUser(config) {
    return config ? api.get("/auth/me", config) : api.get("/auth/me");
  },
  updateProfile({ name, file, removePhoto = false }) {
    const body = new FormData();
    body.append("name", name);
    if (file) body.append("file", file);
    if (removePhoto) body.append("remove_photo", "true");
    return api.patch("/auth/me/profile", body);
  },
  getProfilePhoto(config) {
    return api.get("/auth/me/photo", config);
  },
  async changePassword(payload) {
    const response = await api.post("/auth/change-password", payload);
    const tokens = normalizeTokenResponse(response.data, { requireRefreshToken: true });
    saveAuthTokens(tokens);
    return response;
  },
});
