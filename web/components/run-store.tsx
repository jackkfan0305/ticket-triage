"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { RunResult } from "@/lib/rows";

type RunStore = {
  /** every answer this session has seen, by ticket id */
  results: ReadonlyMap<string, RunResult>;
  record: (id: string, result: RunResult) => void;
};

const Context = createContext<RunStore | null>(null);

/**
 * The session's answers, held above both routes so a soft navigation from the
 * floor to a ticket carries the evidence with it.
 *
 * Nothing here survives a hard reload, and that is deliberate: the product
 * dropped cached runs, so evidence exists only for a run that happened.
 */
export function RunStoreProvider({ children }: { children: React.ReactNode }) {
  const [results, setResults] = useState<ReadonlyMap<string, RunResult>>(() => new Map());

  const record = useCallback((id: string, result: RunResult) => {
    // a new map every time; the held one is never mutated
    setResults((current) => new Map(current).set(id, result));
  }, []);

  const value = useMemo(() => ({ results, record }), [results, record]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useRunStore(): RunStore {
  const store = useContext(Context);
  if (!store) throw new Error("useRunStore must be used inside RunStoreProvider.");
  return store;
}
