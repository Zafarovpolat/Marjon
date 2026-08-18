import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrgProvider, useOrg } from "./OrgContext";

const authState = vi.hoisted(() => ({
  current: { isAuthenticated: true, user: { id: "user-a" } },
}));

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
}));

vi.mock("./AuthContext", () => ({ useAuth: () => authState.current }));
vi.mock("../api/client", () => ({ api: apiMocks }));

function deferred() {
  let resolve;
  const promise = new Promise((promiseResolve) => { resolve = promiseResolve; });
  return { promise, resolve };
}

function OrgName() {
  const { org } = useOrg();
  return <span>{org?.name || "unavailable"}</span>;
}

describe("OrgContext session isolation", () => {
  beforeEach(() => {
    authState.current = { isAuthenticated: true, user: { id: "user-a" } };
    apiMocks.get.mockReset();
    apiMocks.patch.mockReset();
  });

  it("does not show another user's cached company metadata", async () => {
    localStorage.setItem("marjon_org_cache:user-a", JSON.stringify({ name: "Company A" }));
    authState.current = { isAuthenticated: true, user: { id: "user-b" } };
    apiMocks.get.mockResolvedValue({ data: { name: "Company B" } });

    render(<OrgProvider><OrgName /></OrgProvider>);

    expect(screen.queryByText("Company A")).not.toBeInTheDocument();
    expect(await screen.findByText("Company B")).toBeInTheDocument();
  });

  it("ignores a late company response from the previous authenticated user", async () => {
    const userARequest = deferred();
    apiMocks.get.mockImplementationOnce(() => userARequest.promise);

    const view = render(<OrgProvider><OrgName /></OrgProvider>);
    await waitFor(() => expect(apiMocks.get).toHaveBeenCalledTimes(1));

    authState.current = { isAuthenticated: true, user: { id: "user-b" } };
    apiMocks.get.mockResolvedValueOnce({ data: { name: "Company B" } });
    view.rerender(<OrgProvider><OrgName /></OrgProvider>);
    expect(await screen.findByText("Company B")).toBeInTheDocument();

    await act(async () => {
      userARequest.resolve({ data: { name: "Company A late" } });
      await userARequest.promise;
    });

    expect(screen.queryByText("Company A late")).not.toBeInTheDocument();
    expect(screen.getByText("Company B")).toBeInTheDocument();
    expect(localStorage.getItem("marjon_org_cache:user-a")).toBeNull();
  });
});
