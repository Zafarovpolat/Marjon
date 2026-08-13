import { useCallback, useEffect, useRef } from "react";

export function isAbortError(error) {
  return error?.name === "AbortError"
    || error?.name === "CanceledError"
    || error?.code === "ERR_CANCELED";
}

export function isOrderedDateRange(dateFrom, dateTo) {
  return !dateFrom || !dateTo || dateFrom <= dateTo;
}

export function useLatestRequest() {
  const sequenceRef = useRef(0);
  const controllerRef = useRef(null);

  useEffect(() => () => {
    sequenceRef.current += 1;
    controllerRef.current?.abort();
  }, []);

  return useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    controllerRef.current = controller;
    return {
      signal: controller.signal,
      isCurrent: () => sequenceRef.current === sequence && !controller.signal.aborted,
    };
  }, []);
}

export function useMutationLocks() {
  const locksRef = useRef(new Set());

  useEffect(() => () => locksRef.current.clear(), []);

  const acquire = useCallback((key = "default") => {
    if (locksRef.current.has(key)) return false;
    locksRef.current.add(key);
    return true;
  }, []);

  const release = useCallback((key = "default") => {
    locksRef.current.delete(key);
  }, []);

  return { acquire, release };
}
