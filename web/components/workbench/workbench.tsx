"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { DEFAULT_PARAMS, type PolicyParams } from "../../../src/triage/policy";
import type { Ticket } from "../../../src/types";
import { useRunStore } from "@/components/run-store";
import { Floor, type FloorHandle } from "../floor/floor";
import { Hud, SPEEDS, TICKET_COUNTS, type RunState } from "../floor/hud";
import { classify } from "@/lib/classify";
import type { FilterKey } from "@/lib/labels";
import { pooled } from "@/lib/pool";
import { visibleRows, type Row, type RunResult } from "@/lib/rows";

/**
 * Eight in flight. Firing sixty at once turns every latency into queue wait.
 *
 * Over HTTP/1.1 the browser caps concurrent connections to one origin at six,
 * so a local run reaches six however high this goes: measured at 5.94 for 24
 * requests of a known 1s each, and 5.63 across a real 60-ticket run. Raising
 * this number buys nothing until the app is served over HTTP/2, where the cap
 * lifts and eight becomes real. The per-ticket latency stays honest either
 * way, since the route times askJev alone and socket queueing sits outside it.
 */
const POOL_SIZE = 8;

/** The rows the floor starts with. Answers already in hand carry over, so
 *  widening the sample keeps what the run has already decided. */
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
  const [dev, setDev] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [zoom, setZoom] = useState(100);

  const floor = useRef<FloorHandle>(null);

  /** Bumped by Start and by Reset. A settled request from an older run is
   *  discarded, and its worker throws out of the pool instead of fetching. */
  const runId = useRef(0);
  const active = useRef(false);
  const pausedRef = useRef(false);
  const waiting = useRef<(() => void)[]>([]);

  const shown = useMemo(() => visibleRows(rows, params, filter), [rows, params, filter]);
  const samples = useMemo(
    () => rows.flatMap((row) => (row.live && !row.own ? [row.live.latencyMs] : [])),
    [rows],
  );
  const seeded = rows.filter((row) => !row.own).length;
  const routed = rows.filter((row) => !row.own && row.live !== null).length;
  const unrouted = seeded - routed;
  const speed = SPEEDS[speedIndex] ?? 1;

  const runState: RunState =
    seeded > 0 && unrouted === 0 ? "done" : running ? (paused ? "paused" : "running") : "ready";

  const patch = useCallback((id: string, change: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)));
  }, []);

  /** Pause holds the pool at the next ticket rather than cancelling anything
   *  already with the model, so every latency the run reports is a real one. */
  const hold = useCallback((): Promise<void> => {
    if (!pausedRef.current) return Promise.resolve();
    return new Promise<void>((resolve) => {
      waiting.current = [...waiting.current, resolve];
    });
  }, []);

  const release = useCallback(() => {
    const queued = waiting.current;
    waiting.current = [];
    for (const resolve of queued) resolve();
  }, []);

  const runLive = useCallback(async () => {
    if (active.current) return;
    active.current = true;
    const id = (runId.current += 1);

    setRunning(true);
    setPaused(false);
    pausedRef.current = false;
    setRunError(null);
    setWallMs(null);

    const targets = rows.filter((row) => !row.own);
    setRows((current) => current.map((row) => (row.own ? row : { ...row, pending: true, live: null })));

    const started = performance.now();
    let failures = 0;
    let firstReason: string | null = null;

    await pooled(
      targets,
      POOL_SIZE,
      async (row) => {
        if (id !== runId.current) throw new Error("run reset");
        await hold();
        if (id !== runId.current) throw new Error("run reset");
        return classify({ subject: row.subject, body: row.body });
      },
      ({ item, value, error }) => {
        if (id !== runId.current) return;
        if (error) {
          failures += 1;
          // the reason matters more than the count: sixty identical failures
          // are one problem, and the message names it
          firstReason ??= error instanceof Error ? error.message : String(error);
        }
        if (value) {
          setLiveModel(value.model);
          // the store is what a ticket's own route reads, so it gets the
          // answer at the same moment the floor does
          record(item.id, value);
        }
        // each response lands on its own, so rows resolve one at a time
        patch(item.id, { pending: false, live: value ?? null });
      },
    );

    active.current = false;
    if (id !== runId.current) return;

    setWallMs(Math.round(performance.now() - started));
    setRunning(false);
    if (failures > 0) {
      setRunError(`${failures} of ${targets.length} tickets failed. ${firstReason ?? ""}`.trim());
    }
  }, [rows, patch, hold, record]);

  /** Resets the run and nothing else. The arrangement of the floor belongs to
   *  the reader, and Tidy is the only thing that puts it back. */
  const resetRun = useCallback(() => {
    runId.current += 1;
    pausedRef.current = false;
    setPaused(false);
    release();
    setRunning(false);
    setWallMs(null);
    setRunError(null);
    setLiveModel(null);
    setRows((current) => current.map((row) => (row.own ? row : { ...row, live: null, pending: false })));
  }, [release]);

  /** Changing the sample ends the run in flight rather than letting its
   *  answers land on a floor that no longer holds those tickets. Written
   *  tickets are the reader's own and stay. */
  const changeCount = useCallback(
    (next: number) => {
      runId.current += 1;
      active.current = false;
      pausedRef.current = false;
      setPaused(false);
      release();
      setRunning(false);
      setWallMs(null);
      setRunError(null);
      setCount(next);
      setRows((current) => [
        ...current.filter((row) => row.own),
        ...seedRows(seed.slice(0, next), results),
      ]);
    },
    [seed, results, release],
  );

  const toggleRun = useCallback(() => {
    if (runState === "done") return;
    if (!running) {
      void runLive();
      return;
    }
    if (pausedRef.current) {
      pausedRef.current = false;
      setPaused(false);
      release();
    } else {
      pausedRef.current = true;
      setPaused(true);
    }
  }, [runState, running, runLive, release]);

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
        speed={speed}
        onSpeed={() => setSpeedIndex((current) => (current + 1) % SPEEDS.length)}
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
          poolSize={POOL_SIZE}
          speed={speed}
        />
      </main>
    </>
  );
}
