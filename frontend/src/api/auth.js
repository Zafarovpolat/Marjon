import { api } from "./client";

export const authService = Object.freeze({
  getCurrentUser(config) {
    return config ? api.get("/auth/me", config) : api.get("/auth/me");
  },
});
