import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { isAbortError, isOrderedDateRange, useLatestRequest, useMutationLocks } from "./useAsyncSafety";

describe("async safety primitives", () => {
  it("invalidates and aborts an older request owner", () => {
    const { result, unmount } = renderHook(() => useLatestRequest());
    let first;
    let second;
    act(() => {
      first = result.current();
      second = result.current();
    });
    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
    unmount();
    expect(second.signal.aborted).toBe(true);
  });

  it("recognizes intentional cancellation without hiding real errors", () => {
    expect(isAbortError({ code: "ERR_CANCELED" })).toBe(true);
    expect(isAbortError({ name: "AbortError" })).toBe(true);
    expect(isAbortError(new Error("server failed"))).toBe(false);
  });

  it("guards the handler itself against duplicate mutation acquisition", () => {
    const { result } = renderHook(() => useMutationLocks());
    expect(result.current.acquire("save")).toBe(true);
    expect(result.current.acquire("save")).toBe(false);
    expect(result.current.acquire("delete:1")).toBe(true);
    act(() => result.current.release("save"));
    expect(result.current.acquire("save")).toBe(true);
  });

  it("rejects only an obviously inverted ISO date range", () => {
    expect(isOrderedDateRange("2026-08-01", "2026-08-13")).toBe(true);
    expect(isOrderedDateRange("2026-08-13", "2026-08-01")).toBe(false);
    expect(isOrderedDateRange(undefined, "2026-08-01")).toBe(true);
  });
});
