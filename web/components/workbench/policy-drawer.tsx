"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { PolicyParams } from "../../../src/triage/policy";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

type Knob = { path: ParamPath; label: string; min: number; max: number; step: number };

export type ParamPath =
  | "junkBelow"
  | "securityAbove"
  | "outageAbove"
  | "teamConfidenceFloor"
  | "frustratedTagAt"
  | "weights.impact"
  | "weights.time"
  | "weights.frustration"
  | "thresholds.urgent"
  | "thresholds.high"
  | "thresholds.normal";

// Split by what the repo actually tunes: scripts/eval.ts sweeps the three
// thresholds, weights.frustration and teamConfidenceFloor, holding the rest at
// DEFAULT_PARAMS, so the rest sit behind a disclosure.
const PRIMARY: { group: string; knobs: Knob[] }[] = [
  {
    group: "Priority thresholds",
    knobs: [
      { path: "thresholds.urgent", label: "urgent ≥", min: 0, max: 1, step: 0.01 },
      { path: "thresholds.high", label: "high ≥", min: 0, max: 1, step: 0.01 },
      { path: "thresholds.normal", label: "normal ≥", min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    group: "Routing",
    knobs: [{ path: "teamConfidenceFloor", label: "team confidence floor", min: 0, max: 1, step: 0.01 }],
  },
  {
    group: "Urgency weights",
    knobs: [{ path: "weights.frustration", label: "frustration", min: 0, max: 1, step: 0.05 }],
  },
];

const SECONDARY: { group: string; knobs: Knob[] }[] = [
  {
    group: "Gates",
    knobs: [
      { path: "junkBelow", label: "junkBelow", min: 0, max: 1, step: 0.01 },
      { path: "securityAbove", label: "securityAbove", min: 0, max: 1, step: 0.01 },
      { path: "outageAbove", label: "outageAbove", min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    group: "Urgency weights",
    knobs: [
      { path: "weights.impact", label: "impact", min: 0, max: 1, step: 0.05 },
      { path: "weights.time", label: "time", min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    group: "Routing",
    knobs: [{ path: "frustratedTagAt", label: "frustratedTagAt (level)", min: 0, max: 3, step: 1 }],
  },
];

export function readParam(params: PolicyParams, path: ParamPath): number {
  if (path.startsWith("weights.")) return params.weights[path.slice(8) as keyof PolicyParams["weights"]];
  if (path.startsWith("thresholds.")) return params.thresholds[path.slice(11) as keyof PolicyParams["thresholds"]];
  return params[path as "junkBelow" | "securityAbove" | "outageAbove" | "teamConfidenceFloor" | "frustratedTagAt"];
}

/** Returns a new params object; nothing here mutates the one passed in. */
export function writeParam(params: PolicyParams, path: ParamPath, value: number): PolicyParams {
  if (path.startsWith("weights."))
    return { ...params, weights: { ...params.weights, [path.slice(8)]: value } };
  if (path.startsWith("thresholds."))
    return { ...params, thresholds: { ...params.thresholds, [path.slice(11)]: value } };
  return { ...params, [path]: value };
}

type DrawerProps = {
  params: PolicyParams;
  onChange: (params: PolicyParams) => void;
};

function Knobs({ groups, params, onChange }: { groups: typeof PRIMARY } & DrawerProps) {
  return (
    <>
      {groups.map(({ group, knobs }) => (
        <div key={group} className="mb-5">
          <h3 className="cap mb-2 text-ink-3">{group}</h3>
          {knobs.map((knob) => {
            const value = readParam(params, knob.path);
            const id = `knob-${knob.path.replace(".", "-")}`;
            return (
              <div key={knob.path} className="mb-3">
                <div className="mb-1 flex items-baseline gap-2">
                  <Label htmlFor={id} className="flex-1 text-[11.5px] font-normal text-ink-2">
                    {knob.label}
                  </Label>
                  <span className="num text-[11px] text-ink">
                    {knob.step >= 1 ? value : value.toFixed(2)}
                  </span>
                </div>
                <Slider
                  id={id}
                  value={value}
                  min={knob.min}
                  max={knob.max}
                  step={knob.step}
                  onValueChange={(next) => onChange(writeParam(params, knob.path, Number(next)))}
                  className="py-2"
                />
              </div>
            );
          })}
          {group === "Urgency weights" && <WeightSum params={params} />}
        </div>
      ))}
    </>
  );
}

function WeightSum({ params }: { params: PolicyParams }) {
  const sum = params.weights.impact + params.weights.time + params.weights.frustration;
  const off = Math.abs(sum - 1) > 0.001;
  return (
    <p className={`num -mt-1 text-[11px] ${off ? "text-p-high" : "text-ink-3"}`}>
      sum {sum.toFixed(2)}
      {off && " · urgency no longer spans 0–1"}
    </p>
  );
}

export function PolicyDrawer({ params, onChange }: DrawerProps) {
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { thresholds, teamConfidenceFloor } = params;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-line-soft">
      <h2 className="m-0">
        <CollapsibleTrigger className="flex min-h-9 w-full items-baseline gap-2.5 py-2.5 text-left text-ink-2 transition-colors hover:text-ink">
          {open ? (
            <Minus aria-hidden="true" className="size-3 translate-y-px text-ink-3" />
          ) : (
            <Plus aria-hidden="true" className="size-3 translate-y-px text-ink-3" />
          )}
          <span className="cap">Policy parameters</span>
          <span className="num text-[11px] text-ink-3">
            urgent {thresholds.urgent.toFixed(2)} · high {thresholds.high.toFixed(2)} · normal{" "}
            {thresholds.normal.toFixed(2)} · floor {teamConfidenceFloor.toFixed(2)}
          </span>
        </CollapsibleTrigger>
      </h2>

      <CollapsibleContent className="pb-4">
        <div className="grid items-start gap-x-8 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
          <Knobs groups={PRIMARY} params={params} onChange={onChange} />
        </div>

        <Collapsible
          open={moreOpen}
          onOpenChange={setMoreOpen}
          className="mt-1 border-t border-line-soft pt-3"
        >
          <CollapsibleTrigger className="cap flex min-h-6 items-center gap-2 py-1.5 text-ink-3 transition-colors hover:text-ink">
            {moreOpen ? (
              <Minus aria-hidden="true" className="size-3" />
            ) : (
              <Plus aria-hidden="true" className="size-3" />
            )}
            Held fixed in sweeps
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-3 grid items-start gap-x-8 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
              <Knobs groups={SECONDARY} params={params} onChange={onChange} />
            </div>
            <p className="num m-0 text-[11px] leading-relaxed text-ink-3">
              eval.ts holds these six at DEFAULT_PARAMS across every sweep.
            </p>
          </CollapsibleContent>
        </Collapsible>
      </CollapsibleContent>
    </Collapsible>
  );
}
