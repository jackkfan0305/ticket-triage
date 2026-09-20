"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PARAMS, type PolicyParams } from "../../../src/triage/policy";
import { AnswersSchema, type Ticket } from "../../../src/types";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PRIORITY_FILTERS, type FilterKey } from "@/lib/labels";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/motion";
import { pooled } from "@/lib/pool";
import { visibleRows, type Row, type RunResult } from "@/lib/rows";
import { Board } from "./board";
import { Compose } from "./compose";
import { Detail } from "./detail";
import { LatencyRail } from "./latency-rail";
import { PolicyDrawer } from "./policy-drawer";

/** Eight in flight. Firing sixty at once turns every latency into queue wait. */
const POOL_SIZE = 8;

type View = "index" | "detail" | "compose";

type WorkbenchProps = {
  cachedModel: string;
  seed: (Ticket & { answers: unknown })[];
};

async function classify(ticket: { subject: string; body: string }): Promise<RunResult> {
  const response = await fetch("/api/classify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ticket),
  });
  const payload = (await response.json()) as { model?: string; answers?: unknown; latencyMs?: number; error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status}).`);
  return {
    model: payload.model ?? "unknown",
    answers: AnswersSchema.parse(payload.answers),
    latencyMs: payload.latencyMs ?? 0,
  };
}

export function Workbench({ cachedModel, seed }: WorkbenchProps) {
  const [rows, setRows] = useState<Row[]>(() =>
    seed.map((ticket) => ({
      id: ticket.id,
      subject: ticket.subject,
      body: ticket.body,
      cached: AnswersSchema.parse(ticket.answers),
      live: null,
      pending: false,
      own: false,
    })),
  );
  const [params, setParams] = useState<PolicyParams>(DEFAULT_PARAMS);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [view, setView] = useState<View>("index");
  const [selected, setSelected] = useState<string | null>(seed[0]?.id ?? null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [wallMs, setWallMs] = useState<number | null>(null);
  const [liveModel, setLiveModel] = useState<string | null>(null);
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const main = useRef<HTMLElement>(null);
  const ownCount = useRef(0);

  const shown = useMemo(() => visibleRows(rows, params, filter), [rows, params, filter]);
  const samples = useMemo(
    () => rows.flatMap((row) => (row.live && !row.own ? [row.live.latencyMs] : [])),
    [rows],
  );
  const seeded = rows.filter((row) => !row.own).length;
  const selectedRow = rows.find((row) => row.id === selected) ?? null;

  const patch = useCallback((id: string, change: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)));
  }, []);

  const open = useCallback((id: string) => {
    setSelected(id);
    setView("detail");
  }, []);

  const step = useCallback(
    (delta: number) => {
      if (shown.length === 0) return;
      const index = shown.findIndex((row) => row.id === selected);
      if (index < 0) return;
      const next = shown[(index + delta + shown.length) % shown.length];
      if (next) setSelected(next.id);
    },
    [shown, selected],
  );

  // j/k, arrows and Escape drive the detail view from the keyboard
  useEffect(() => {
    if (view !== "detail") return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [role='slider']")) return;
      if (event.key === "Escape") setView("index");
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        step(1);
      }
      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        step(-1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [view, step]);

  // the view swap is what the eye follows, so it gets the transition
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from(main.current, { autoAlpha: 0, y: 6, duration: 0.26, ease: "power2.out" });
    },
    { dependencies: [view] },
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [view, selected]);

  const runLive = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setRunError(null);
    setProgress(0);
    setWallMs(null);

    const targets = rows.filter((row) => !row.own);
    setRows((current) => current.map((row) => (row.own ? row : { ...row, pending: true, live: null })));

    const started = performance.now();
    let failures = 0;

    await pooled(
      targets,
      POOL_SIZE,
      (row) => classify({ subject: row.subject, body: row.body }),
      ({ item, value, error }) => {
        if (error) failures += 1;
        if (value) setLiveModel(value.model);
        // each response lands on its own, so rows resolve one at a time
        patch(item.id, { pending: false, live: value ?? null });
        setProgress((done) => done + 1);
      },
    );

    setWallMs(Math.round(performance.now() - started));
    setRunning(false);
    if (failures > 0) setRunError(`${failures} of ${targets.length} tickets failed; the rest are shown.`);
  }, [running, rows, patch]);

  const submitCompose = useCallback(
    async ({ subject, body }: { subject: string; body: string }) => {
      setComposeBusy(true);
      setComposeError(null);
      ownCount.current += 1;
      const id = `own-${ownCount.current}`;

      setRows((current) => [
        { id, subject: subject || "(no subject)", body, cached: null, live: null, pending: true, own: true },
        ...current,
      ]);
      setSelected(id);
      setView("detail");

      try {
        const result = await classify({ subject, body });
        setLiveModel(result.model);
        patch(id, { pending: false, live: result });
      } catch (error) {
        setRows((current) => current.filter((row) => row.id !== id));
        setComposeError(error instanceof Error ? error.message : "Classification failed.");
        setView("compose");
      } finally {
        setComposeBusy(false);
      }
    },
    [patch],
  );

  return (
    <div className="gutter pb-18">
      <header className="flex flex-wrap items-center gap-3.5 border-b border-line py-4">
        <h1 className="m-0 flex items-baseline gap-2.5 text-[15px] font-medium tracking-tight">
          Triage&nbsp;Workbench
        </h1>
        <p className="num m-0 rounded border border-line bg-panel-2 px-1.5 py-0.5 text-[11px] tracking-[0.04em] uppercase text-ink-2">
          {liveModel ?? cachedModel}
        </p>
        <p
          className={`num m-0 rounded border px-1.5 py-0.5 text-[11px] tracking-[0.04em] uppercase ${
            liveModel
              ? "border-p-urgent bg-[var(--p-urgent-bg)] text-p-urgent"
              : "border-line bg-panel-2 text-ink-2"
          }`}
        >
          {liveModel ? "live run" : "cached run"}
        </p>
        <span className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => setParams(DEFAULT_PARAMS)} className="h-8 text-xs">
          Reset params
        </Button>
        <Button size="sm" onClick={runLive} disabled={running} className="h-8 text-xs">
          {running ? `Receiving · ${progress} / ${seeded}` : `Run live · ${seeded} tickets`}
        </Button>
      </header>

      <PolicyDrawer params={params} onChange={setParams} />

      <main ref={main} className="block pt-1.5">
        <section id="view-index" hidden={view !== "index"} aria-labelledby="tickets-heading">
          <LatencyRail samples={samples} wallMs={wallMs} total={seeded} />

          {runError && (
            <p className="num py-2 text-[11.5px] text-p-high" role="status">
              {runError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-5 pb-2.5">
            <h2 id="tickets-heading" className="cap m-0 whitespace-nowrap text-ink-2">
              Tickets
              <span className="num ml-1.5 text-[11px] font-light tracking-normal normal-case text-ink-3">
                {shown.length === rows.length ? rows.length : `${shown.length} / ${rows.length}`}
              </span>
            </h2>

            <ToggleGroup
              value={[filter]}
              // single-select; clicking the pressed chip clears it, which reads as "all"
              onValueChange={(next) => setFilter((next.at(-1) as FilterKey | undefined) ?? "all")}
              aria-label="Filter tickets by outcome"
              spacing={1}
              className="flex-1"
            >
              {PRIORITY_FILTERS.map((key) => (
                <ToggleGroupItem
                  key={key}
                  value={key}
                  variant="outline"
                  size="sm"
                  className="num h-7 rounded-full px-2.5 text-[11px]"
                >
                  {key}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <Button variant="outline" size="sm" onClick={() => setView("compose")} className="h-8 text-xs">
              Write your own ticket
            </Button>
          </div>

          <Board rows={shown} params={params} onOpen={open} />
        </section>

        <section id="view-detail" hidden={view !== "detail"} aria-label="Ticket evidence">
          <Detail row={selectedRow} params={params} onBack={() => setView("index")} onStep={step} />
        </section>

        <section id="view-compose" hidden={view !== "compose"} aria-label="Write your own ticket">
          <Compose
            busy={composeBusy}
            error={composeError}
            onSubmit={submitCompose}
            onBack={() => setView("index")}
          />
        </section>
      </main>
    </div>
  );
}
