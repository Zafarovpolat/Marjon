import { api } from "./client";

export const authService = Object.freeze({
  getCurrentUser() {
    return api.get("/auth/me");
  },
});
