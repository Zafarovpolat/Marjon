import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { authService } from "../api/auth";
import { useProfilePhoto } from "./useProfilePhoto";
vi.mock("../api/auth", () => ({ authService: { getProfilePhoto: vi.fn() } }));

describe("authenticated profile photos", () => {
  it("does not leak an old user's late image response into another account", async () => {
    let finishOld;
    authService.getProfilePhoto.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce({ data: { image: "data:image/webp;base64,NEW" } });
    const { result, rerender } = renderHook(({ user }) => useProfilePhoto(user), {
      initialProps: { user: { id: "old", avatar_url: "/old.webp" } },
    });
    const oldSignal = authService.getProfilePhoto.mock.calls[0][0].signal;
    rerender({ user: { id: "new", avatar_url: "/new.webp" } });
    expect(oldSignal.aborted).toBe(true);
    await waitFor(() => expect(result.current).toBe("data:image/webp;base64,NEW"));
    await act(async () => finishOld({ data: { image: "data:image/webp;base64,OLD" } }));
    expect(result.current).toBe("data:image/webp;base64,NEW");
    rerender({ user: null });
    expect(result.current).toBe("");
  });
});
