"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { DEFAULT_PARAMS, type PolicyParams } from "../../../src/triage/policy";
import type { Ticket } from "../../../src/types";
import { useRunStore } from "@/components/run-store";
import { Floor, type FloorHandle } from "../floor/floor";
import { Hud, TICKET_COUNTS, type RunState } from "../floor/hud";
import { classifyRun, setRunPaused } from "@/lib/classify";
import type { FilterKey } from "@/lib/labels";
import { visibleRows, type Row, type RunResult } from "@/lib/rows";

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

/** The rows the floor starts with. Answers already in hand carry over, which
 *  is what a return from a ticket page needs; a sample change passes an empty
 *  map instead and starts clean. */
const seedRows = (
  tickets: readonly Ticket[],
  results: ReadonlyMap<string, RunResult>,
): Row[] =>
  tickets.map((ticket) => ({
    id: ticket.id,
    subject: ticket.subject,
    body: ticket.body,
    live: results.get(ticket.id) ?? null,
    pending: false,
    own: false,
  }));

type WorkbenchProps = {
  seed: Ticket[];
};

export function Workbench({ seed }: WorkbenchProps) {
  const { results, record } = useRunStore();

  const [count, setCount] = useState<number>(TICKET_COUNTS[0]);
  // Seeded from the store, so coming back from a ticket finds the run intact.
  // Reading it once on mount is the point: later answers arrive through the
  // run itself, and re-reading the map would fight it.
  const [rows, setRows] = useState<Row[]>(() => seedRows(seed.slice(0, TICKET_COUNTS[0]), results));
  const [params, setParams] = useState<PolicyParams>(DEFAULT_PARAMS);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [wallMs, setWallMs] = useState<number | null>(null);
  const [liveModel, setLiveModel] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [concurrency, setConcurrency] = useState(ASSUMED_CONCURRENCY);
  const [dev, setDev] = useState(false);
  const [zoom, setZoom] = useState(100);

  const floor = useRef<FloorHandle>(null);

  /** Bumped by Start and by Reset. A settled request from an older run is
   *  discarded, and its worker throws out of the pool instead of fetching. */
  const runId = useRef(0);
  const active = useRef(false);
  const pausedRef = useRef(false);
  /** The run the server knows about, and the handle that drops its stream. */
  const runKey = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const shown = useMemo(() => visibleRows(rows, params, filter), [rows, params, filter]);
  const samples = useMemo(
    () => rows.flatMap((row) => (row.live && !row.own ? [row.live.latencyMs] : [])),
    [rows],
  );
  const seeded = rows.filter((row) => !row.own).length;
  const routed = rows.filter((row) => !row.own && row.live !== null).length;
  const unrouted = seeded - routed;

  const runState: RunState =
    seeded > 0 && unrouted === 0 ? "done" : running ? (paused ? "paused" : "running") : "ready";

  const patch = useCallback((id: string, change: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)));
  }, []);

  /** Ends whatever is in flight. The server reads the dropped stream as the
   *  run being abandoned and stops sending tickets to the model. */
  const stopStream = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    runKey.current = null;
    active.current = false;
  }, []);

  const runLive = useCallback(async () => {
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

    const targets = rows.filter((row) => !row.own);
    // clearing the evidence is all a start does; a ticket turns pending when
    // the pool actually sends it, so the floor shows what is with the model now
    setRows((current) => current.map((row) => (row.own ? row : { ...row, pending: false, live: null })));

    const started = performance.now();
    let failures = 0;
    let firstReason: string | null = null;
    let broke: string | null = null;

    try {
      const stream = classifyRun(
        targets.map(({ id: ticket, subject, body }) => ({ id: ticket, subject, body })),
        key,
        controller.signal,
      );
      for await (const event of stream) {
        if (id !== runId.current) break;
        if (event.type === "open") {
          setConcurrency(event.concurrency);
        } else if (event.type === "start") {
          patch(event.id, { pending: true });
        } else if (event.type === "error") {
          failures += 1;
          // the reason matters more than the count: a hundred identical
          // failures are one problem, and the message names it
          firstReason ??= event.error;
          patch(event.id, { pending: false, live: null });
        } else {
          const result = { model: event.model, answers: event.answers, latencyMs: event.latencyMs };
          setLiveModel(event.model);
          // the store is what a ticket's own route reads, so it gets the
          // answer at the same moment the floor does
          record(event.id, result);
          // each response lands on its own, so rows resolve one at a time
          patch(event.id, { pending: false, live: result });
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
    setRows((current) => current.map((row) => (row.pending ? { ...row, pending: false } : row)));
    if (broke !== null) {
      setRunError(broke);
    } else if (failures > 0) {
      setRunError(`${failures} of ${targets.length} tickets failed. ${firstReason ?? ""}`.trim());
    }
  }, [rows, patch, record]);

  /** Resets the run and nothing else. The arrangement of the floor belongs to
   *  the reader, and Tidy is the only thing that puts it back. */
  const resetRun = useCallback(() => {
    runId.current += 1;
    pausedRef.current = false;
    setPaused(false);
    stopStream();
    setRunning(false);
    setWallMs(null);
    setRunError(null);
    setLiveModel(null);
    setRows((current) => current.map((row) => (row.own ? row : { ...row, live: null, pending: false })));
  }, [stopStream]);

  /** Changing the sample ends the run in flight rather than letting its
   *  answers land on a floor that no longer holds those tickets, and starts
   *  the new sample unclassified so Start is live again. Written tickets are
   *  the reader's own and stay. */
  const changeCount = useCallback(
    (next: number) => {
      runId.current += 1;
      pausedRef.current = false;
      setPaused(false);
      stopStream();
      setRunning(false);
      setWallMs(null);
      setRunError(null);
      setLiveModel(null);
      setCount(next);
      setRows((current) => [
        ...current.filter((row) => row.own),
        ...seedRows(seed.slice(0, next), new Map()),
      ]);
    },
    [seed, stopStream],
  );

  const toggleRun = useCallback(() => {
    if (runState === "done") return;
    if (!running) {
      void runLive();
      return;
    }
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    // the pool is the server's now, so the hold has to travel
    const key = runKey.current;
    if (key !== null) void setRunPaused(key, next);
  }, [runState, running, runLive]);

  return (
    <>
      {/* the page's own heading, ahead of the chrome in reading order; the
          floor is a canvas and has nothing to draw it on */}
      <h1 className="sr-only">Ticket Triage</h1>

      <Hud
        onFloor
        runState={runState}
        onRun={toggleRun}
        onReset={resetRun}
        dev={dev}
        onDev={() => setDev((current) => !current)}
        count={count}
        onCount={changeCount}
        runError={runError}
        camera={{
          zoom,
          onZoomIn: () => floor.current?.zoomIn(),
          onZoomOut: () => floor.current?.zoomOut(),
          onFrame: () => floor.current?.frame(),
          onTidy: () => floor.current?.tidy(),
        }}
        samples={samples}
        wallMs={wallMs}
        total={seeded}
        model={liveModel}
        params={params}
        onParams={setParams}
        onResetParams={() => setParams(DEFAULT_PARAMS)}
      />

      {/* the floor is the page: a fixed section, so the chrome floats over it
          and nothing above it steals height */}
      <main className="fixed inset-0" aria-label="Triage floor">
        <Floor
          ref={floor}
          onZoom={setZoom}
          rows={shown}
          params={params}
          filter={filter}
          onFilter={setFilter}
          poolSize={concurrency}
        />
      </main>
    </>
  );
}
