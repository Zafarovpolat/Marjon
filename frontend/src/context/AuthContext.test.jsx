import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

const authClient = vi.hoisted(() => ({
  get: vi.fn(),
  isAuthenticated: vi.fn(() => false),
  login: vi.fn(),
  loginByPhone: vi.fn(),
  loginByPin: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("../api/client", () => ({
  api: { get: authClient.get },
  isAuthenticated: authClient.isAuthenticated,
  login: authClient.login,
  loginByPhone: authClient.loginByPhone,
  loginByPin: authClient.loginByPin,
  logout: authClient.logout,
}));

function AuthProbe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(auth.loading)}</span>
      <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="user">{auth.user ? "present" : "missing"}</span>
      <span data-testid="role">{auth.role || "none"}</span>
    </div>
  );
}

describe("AuthContext", () => {
  it("handles a session without stored tokens", async () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));

    expect(screen.getByTestId("authenticated")).toHaveTextContent("false");
    expect(screen.getByTestId("user")).toHaveTextContent("missing");
    expect(screen.getByTestId("role")).toHaveTextContent("none");
    expect(authClient.get).not.toHaveBeenCalled();
  });
});
