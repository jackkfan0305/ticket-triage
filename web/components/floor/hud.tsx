"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "cn";
import {
  Gauge,
  LayoutGrid,
  Maximize,
  Minus,
  Moon,
  Pause,
  PenLine,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import type { PolicyParams } from "../../../src/triage/policy";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LatencyRail } from "../workbench/latency-rail";
import { PolicyDrawer } from "../workbench/policy-drawer";

export type RunState = "ready" | "running" | "paused" | "done";

const RUN_LABEL: Record<RunState, string> = {
  ready: "Start",
  running: "Pause",
  paused: "Resume",
  done: "Done",
};

/** Playback speed for the ticket flights. The model's own latency is measured
 *  by the route and is not touched by this. */
export const SPEEDS = [1, 2, 4] as const;

/** How much of the eval set is on the floor. The run classifies exactly what
 *  is on the floor, so this picks the sample and the workload at once. */
export const TICKET_COUNTS = [50, 100, 500, 1000] as const;

type Camera = {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFrame: () => void;
  onTidy: () => void;
};

type HudProps = {
  /** the floor's own clusters only appear over the floor */
  onFloor: boolean;
  runState: RunState;
  onRun: () => void;
  onReset: () => void;
  speed: number;
  onSpeed: () => void;
  dev: boolean;
  onDev: () => void;
  count: number;
  onCount: (count: number) => void;
  runError: string | null;
  camera: Camera;
  samples: readonly number[];
  wallMs: number | null;
  total: number;
  model: string | null;
  params: PolicyParams;
  onParams: (params: PolicyParams) => void;
  onResetParams: () => void;
};

function Panel({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border border-line bg-panel shadow-xl ${className}`}>{children}</div>
  );
}

/** The icon shows the theme you would switch to. Resolved after mount, because
 *  the server cannot know the reader's system preference. */
function ThemeButton() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    const stamped = document.documentElement.dataset.theme;
    setDark(stamped ? stamped === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="rounded-full"
      aria-label={dark === null ? "Switch theme" : dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => {
        const next = !dark;
        document.documentElement.dataset.theme = next ? "dark" : "light";
        setDark(next);
      }}
    >
      {dark ? <Sun aria-hidden="true" className="size-3.5" /> : <Moon aria-hidden="true" className="size-3.5" />}
    </Button>
  );
}

export function Hud({
  onFloor,
  runState,
  onRun,
  onReset,
  speed,
  onSpeed,
  dev,
  onDev,
  count,
  onCount,
  runError,
  camera,
  samples,
  wallMs,
  total,
  model,
  params,
  onParams,
  onResetParams,
}: HudProps) {
  const running = runState === "running";

  return (
    <>
      {/* the corner carries the run's own failure and nothing else */}
      <div className="hud hud-tl no-select" hidden={!runError}>
        {runError && (
          <Panel className="max-w-[min(420px,calc(100vw-2rem))] border-p-urgent px-3.5 py-2">
            <p role="status" className="num m-0 text-[11px] leading-snug text-p-urgent">
              {runError}
            </p>
          </Panel>
        )}
      </div>

      <div className="hud hud-tr no-select">
        {/* wraps rather than overflowing: on a phone the cluster is taller
            than one row and the page still has no horizontal scroll */}
        <Panel className="flex max-w-full flex-wrap items-center justify-end gap-1.5 rounded-[22px] p-1.5">
          <Select
            value={count}
            onValueChange={(next) => onCount(Number(next))}
            items={TICKET_COUNTS.map((size) => ({ value: size, label: `${size} tickets` }))}
          >
            {/* the size variant carries its own radius, so the pill has to
                answer it in the same variant to win */}
            <SelectTrigger
              size="sm"
              aria-label="How many tickets on the floor"
              className="num border-line text-[11px] text-ink-2 data-[size=sm]:rounded-full"
            >
              <SelectValue />
            </SelectTrigger>
            {/* the panels' own shape: a rounded surface with pill rows inside,
                dropped clear of the trigger rather than covering it */}
            <SelectContent
              align="end"
              sideOffset={8}
              alignItemWithTrigger={false}
              className="w-fit min-w-(--anchor-width) rounded-[18px] border border-line bg-panel p-1.5 shadow-xl ring-0"
            >
              {TICKET_COUNTS.map((size) => (
                <SelectItem
                  key={size}
                  value={size}
                  className="num rounded-full py-1.5 pl-2.5 text-[11px] data-selected:bg-panel-2"
                >
                  {size} tickets
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="sm"
            onClick={onSpeed}
            className="num gap-1.5 rounded-full"
            aria-label={`Playback speed, ${speed} times`}
          >
            <Gauge aria-hidden="true" className="size-3.5" />
            {speed}×
          </Button>

          <Button
            size="sm"
            onClick={onRun}
            disabled={runState === "done"}
            className="gap-1.5 rounded-full px-3.5"
          >
            {running ? (
              <Pause aria-hidden="true" className="size-3.5" />
            ) : (
              <Play aria-hidden="true" className="size-3.5" />
            )}
            {RUN_LABEL[runState]}
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onReset}
            className="rounded-full"
            aria-label="Reset the run"
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
          </Button>

          {/* it goes somewhere, so it is a link, wearing the buttons' clothes */}
          <Link
            href="/compose"
            aria-label="Write your own ticket"
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "rounded-full")}
          >
            <PenLine aria-hidden="true" className="size-3.5" />
          </Link>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDev}
            aria-pressed={dev}
            className="rounded-full aria-pressed:bg-ink aria-pressed:text-background"
            aria-label={dev ? "Hide developer mode" : "Show developer mode"}
          >
            <SlidersHorizontal aria-hidden="true" className="size-3.5" />
          </Button>

          <ThemeButton />
        </Panel>
      </div>

      {onFloor && (
        <div className="hud hud-br no-select">
          <Panel className="flex max-w-full flex-wrap items-center justify-end gap-1 rounded-[22px] p-1.5">
            <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label="Zoom out" onClick={camera.onZoomOut}>
              <Minus aria-hidden="true" className="size-3.5" />
            </Button>
            <span role="status" className="num min-w-11 text-center text-[10.5px] text-ink-2">
              {camera.zoom}%
            </span>
            <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label="Zoom in" onClick={camera.onZoomIn}>
              <Plus aria-hidden="true" className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label="Frame everything" onClick={camera.onFrame}>
              <Maximize aria-hidden="true" className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label="Tidy the layout" onClick={camera.onTidy}>
              <LayoutGrid aria-hidden="true" className="size-3.5" />
            </Button>
          </Panel>
        </div>
      )}

      <div className="hud hud-bl" hidden={!dev}>
        {dev && (
          <Panel className="max-h-[52svh] w-full max-w-[900px] overflow-y-auto px-4.5 py-3.5">
            <div className="grid items-start gap-x-6 gap-y-4 md:grid-cols-[minmax(190px,1fr)_minmax(240px,1.3fr)]">
              <LatencyRail samples={samples} wallMs={wallMs} total={total} model={model} />

              <section aria-labelledby="policy-heading" className="min-w-0">
                <div className="mb-1.5 flex items-baseline gap-2.5">
                  <h2 id="policy-heading" className="cap m-0 text-ink-3">
                    Policy
                  </h2>
                  <Button variant="outline" size="xs" onClick={onResetParams} className="ml-auto rounded-full">
                    Reset params
                  </Button>
                </div>
                <PolicyDrawer params={params} onChange={onParams} />
              </section>
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}
