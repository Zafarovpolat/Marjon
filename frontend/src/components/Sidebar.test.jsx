import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar";

describe("Sidebar", () => {
  it("does not crash when user data is missing", () => {
    render(
      <MemoryRouter>
        <Sidebar user={null} collapsed={false} onToggle={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByAltText("Owner")).toBeInTheDocument();
  });
});
