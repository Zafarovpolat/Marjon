import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./LoginPage";

const auth = vi.hoisted(() => ({
  loginPhone: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => auth,
}));

const owner = {
  id: "owner",
  auth_scope: "app",
  company_id: "company-1",
  is_superadmin: false,
  role_slugs: ["owner"],
};

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <LocationProbe />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>OWNER APP</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function submitCredentials() {
  const inputs = document.querySelectorAll(".login-pro-card input");
  fireEvent.change(inputs[0], { target: { value: "901234567" } });
  fireEvent.change(inputs[1], { target: { value: "password" } });
  fireEvent.submit(document.querySelector(".login-pro-card"));
}

describe("OWNER Web login landing", () => {
  beforeEach(() => {
    auth.logout.mockResolvedValue();
  });

  it("keeps a canonical OWNER login on the OWNER APP landing", async () => {
    auth.loginPhone.mockResolvedValue(owner);
    renderLogin();
    submitCredentials();

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/"));
    expect(screen.getByText("OWNER APP")).toBeInTheDocument();
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it.each(["manager", "cashier", "waiter", "kitchen", "monoblock", "courier", "warehouse", "admin"])(
    "rejects %s as an operational Web login",
    async (role) => {
      auth.loginPhone.mockResolvedValue({ ...owner, id: role, role_slugs: [role] });
      renderLogin();
      submitCredentials();

      await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1));
      expect(screen.getByTestId("location")).toHaveTextContent("/login");
      expect(document.querySelector(".login-pro-alert")).toHaveTextContent("не поддерживается в Web Launch V1");
    },
  );

  it("keeps the HQ SUPER_ADMIN identity out of the OWNER APP", async () => {
    auth.loginPhone.mockResolvedValue({
      id: "superadmin",
      auth_scope: "hq_admin",
      company_id: null,
      is_superadmin: true,
      role_slugs: [],
    });
    renderLogin();
    submitCredentials();

    await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
    expect(screen.queryByText("OWNER APP")).not.toBeInTheDocument();
  });
});
