"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { classifyRun, setRunPaused, type RunTicket } from "@/lib/classify";
import { TICKET_COUNTS, type RunResult } from "@/lib/rows";

/**
 * What the floor claims is with the model before a run has said otherwise.
 *
 * The pool itself lives in /api/classify/run, because a browser opens at most
 * six connections to one origin over HTTP/1.1: a pool of eight here only ever
 * reached 5.8 in flight. The run's first line carries the server's real number
 * and replaces this one, so this only has to match its default.
 */
const ASSUMED_CONCURRENCY = 8;

/** Only has to be unique within a session; the server keys the pause on it. */
const newRunKey = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;

type RunSession = {
  /** what the current run has answered, by ticket id */
  results: ReadonlyMap<string, RunResult>;
  /** the ids the pool has sent to the model and not heard back on */
  pending: ReadonlySet<string>;
  /** how much of the eval set is on the floor */
  count: number;
  running: boolean;
  paused: boolean;
  runError: string | null;
  wallMs: number | null;
  liveModel: string | null;
  concurrency: number;
  start: (tickets: readonly RunTicket[]) => void;
  togglePause: () => void;
  reset: () => void;
  setCount: (next: number) => void;
};

const Context = createContext<RunSession | null>(null);

/**
 * The run itself: its answers, its progress, and the handle that stops it.
 *
 * All of it lives above the routes because the floor unmounts the moment a
 * reader opens a ticket. State held inside the floor would be snapshotted on
 * the way back, and a run still in flight would go on writing to a component
 * nobody is looking at: the floor would come back missing tickets and offer to
 * start a second run over the first. Holding the run here means every surface
 * reads the same one, whichever is mounted.
 *
 * Nothing here survives a hard reload, and that is deliberate: the product
 * dropped cached runs, so evidence exists only for a run that happened.
 */
export function RunStoreProvider({ children }: { children: React.ReactNode }) {
  const [results, setResults] = useState<ReadonlyMap<string, RunResult>>(() => new Map());
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [count, setCountState] = useState<number>(TICKET_COUNTS[0]);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [wallMs, setWallMs] = useState<number | null>(null);
  const [liveModel, setLiveModel] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [concurrency, setConcurrency] = useState(ASSUMED_CONCURRENCY);

  /** Bumped by Start and by Reset. A settled request from an older run is
   *  discarded, and its worker throws out of the pool instead of fetching. */
  const runId = useRef(0);
  const active = useRef(false);
  const pausedRef = useRef(false);
  /** The run the server knows about, and the handle that drops its stream. */
  const runKey = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  /** A ticket the model has come back on. A failed one loses whatever answer it
   *  had: an answer from an earlier run would read as this run's. */
  const resolve = useCallback((id: string, result: RunResult | null) => {
    setPending((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setResults((current) => {
      const next = new Map(current);
      if (result === null) next.delete(id);
      else next.set(id, result);
      return next;
    });
  }, []);

  /** Drops the run's evidence everywhere at once, so a ticket route cannot show
   *  a verdict the floor has already thrown away. */
  const clearEvidence = useCallback(() => {
    setResults(new Map());
    setPending(new Set());
  }, []);

  /** Ends whatever is in flight. The server reads the dropped stream as the
   *  run being abandoned and stops sending tickets to the model. */
  const stopStream = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    runKey.current = null;
    active.current = false;
  }, []);

  const runLive = useCallback(
    async (tickets: readonly RunTicket[]) => {
      if (active.current) return;
      active.current = true;
      const id = (runId.current += 1);
      const key = newRunKey();
      const controller = new AbortController();
      runKey.current = key;
      abort.current = controller;

      setRunning(true);
      setPaused(false);
      pausedRef.current = false;
      setRunError(null);
      setWallMs(null);
      // clearing the evidence is all a start does; a ticket turns pending when
      // the pool actually sends it, so the floor shows what is with the model now
      clearEvidence();

      const started = performance.now();
      let failures = 0;
      let firstReason: string | null = null;
      let broke: string | null = null;

      try {
        for await (const event of classifyRun(tickets, key, controller.signal)) {
          if (id !== runId.current) break;
          if (event.type === "open") {
            setConcurrency(event.concurrency);
          } else if (event.type === "start") {
            setPending((current) => new Set(current).add(event.id));
          } else if (event.type === "error") {
            failures += 1;
            // the reason matters more than the count: a hundred identical
            // failures are one problem, and the message names it
            firstReason ??= event.error;
            resolve(event.id, null);
          } else {
            setLiveModel(event.model);
            // each response lands on its own, so rows resolve one at a time
            resolve(event.id, { model: event.model, answers: event.answers, latencyMs: event.latencyMs });
          }
        }
      } catch (error) {
        // an abort is a reset or a new sample, not a failure worth reporting
        if (!controller.signal.aborted) broke = error instanceof Error ? error.message : String(error);
      }

      if (abort.current === controller) {
        abort.current = null;
        runKey.current = null;
      }
      active.current = false;
      if (id !== runId.current || controller.signal.aborted) return;

      setWallMs(Math.round(performance.now() - started));
      setRunning(false);
      // a ticket the stream never reached is not pending any more
      setPending(new Set());
      if (broke !== null) {
        setRunError(broke);
      } else if (failures > 0) {
        setRunError(`${failures} of ${tickets.length} tickets failed. ${firstReason ?? ""}`.trim());
      }
    },
    [clearEvidence, resolve],
  );

  const start = useCallback((tickets: readonly RunTicket[]) => void runLive(tickets), [runLive]);

  /** Resets the run and nothing else. The arrangement of the floor belongs to
   *  the reader, and Tidy is the only thing that puts it back. */
  const reset = useCallback(() => {
    runId.current += 1;
    pausedRef.current = false;
    setPaused(false);
    stopStream();
    setRunning(false);
    setWallMs(null);
    setRunError(null);
    setLiveModel(null);
    clearEvidence();
  }, [stopStream, clearEvidence]);

  /** Changing the sample ends the run in flight rather than letting its answers
   *  land on a floor that no longer holds those tickets. */
  const setCount = useCallback(
    (next: number) => {
      reset();
      setCountState(next);
    },
    [reset],
  );

  const togglePause = useCallback(() => {
    const key = runKey.current;
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    setRunError(null);
    if (key === null) return;
    // the pool is the server's now, so the hold has to travel. A hold that
    // never arrives leaves the run sending tickets, so the button goes back to
    // what is true rather than claiming a pause the model never heard.
    void setRunPaused(key, next).catch((reason: unknown) => {
      if (runKey.current !== key || pausedRef.current !== next) return;
      pausedRef.current = !next;
      setPaused(!next);
      const message = reason instanceof Error ? reason.message : String(reason);
      setRunError(`The run did not ${next ? "pause" : "resume"}: ${message}`);
    });
  }, []);

  const value = useMemo(
    () => ({
      results,
      pending,
      count,
      running,
      paused,
      runError,
      wallMs,
      liveModel,
      concurrency,
      start,
      togglePause,
      reset,
      setCount,
    }),
    [results, pending, count, running, paused, runError, wallMs, liveModel, concurrency, start, togglePause, reset, setCount],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useRunStore(): RunSession {
  const store = useContext(Context);
  if (!store) throw new Error("useRunStore must be used inside RunStoreProvider.");
  return store;
}
