"use client";

import { useMemo, useRef, useState } from "react";
import { DEFAULT_PARAMS, type PolicyParams } from "../../../src/triage/policy";
import type { Ticket } from "../../../src/types";
import { useRunStore } from "@/components/run-store";
import { Floor, type FloorHandle } from "../floor/floor";
import { Hud, type RunState } from "../floor/hud";
import type { FilterKey } from "@/lib/labels";
import { visibleRows, type Row } from "@/lib/rows";

type WorkbenchProps = {
  seed: Ticket[];
};

export function Workbench({ seed }: WorkbenchProps) {
  const {
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
  } = useRunStore();

  const [params, setParams] = useState<PolicyParams>(DEFAULT_PARAMS);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [dev, setDev] = useState(false);
  const [zoom, setZoom] = useState(100);

  const floor = useRef<FloorHandle>(null);

  /** Read from the run on every render rather than snapshotted on mount: a run
   *  that started before this floor existed goes on writing to the session, and
   *  its answers have to land here as they arrive. */
  const rows = useMemo<Row[]>(
    () =>
      seed.slice(0, count).map((ticket) => ({
        id: ticket.id,
        subject: ticket.subject,
        body: ticket.body,
        live: results.get(ticket.id) ?? null,
        pending: pending.has(ticket.id),
        own: false,
      })),
    [seed, count, results, pending],
  );

  const shown = useMemo(() => visibleRows(rows, params, filter), [rows, params, filter]);
  const samples = useMemo(() => rows.flatMap((row) => (row.live ? [row.live.latencyMs] : [])), [rows]);
  const routed = rows.filter((row) => row.live !== null).length;

  const runState: RunState =
    rows.length > 0 && routed === rows.length
      ? "done"
      : running
        ? paused
          ? "paused"
          : "running"
        : "ready";

  const toggleRun = () => {
    if (runState === "done") return;
    if (running) {
      togglePause();
      return;
    }
    start(rows.map(({ id, subject, body }) => ({ id, subject, body })));
  };

  return (
    <>
      {/* the page's own heading, ahead of the chrome in reading order; the
          floor is a canvas and has nothing to draw it on */}
      <h1 className="sr-only">Ticket Triage</h1>

      <Hud
        onFloor
        runState={runState}
        onRun={toggleRun}
        onReset={reset}
        dev={dev}
        onDev={() => setDev((current) => !current)}
        count={count}
        onCount={setCount}
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
        total={rows.length}
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
