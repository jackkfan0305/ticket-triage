"use client";

import type { PolicyParams } from "../../../src/triage/policy";
import type { Answers } from "../../../src/types";
import { GATE_KEYS, GATE_LABEL } from "@/lib/labels";
import type { Verdict } from "@/lib/rows";
import { Progress } from "@/components/ui/progress";
import { Counter } from "./counter";

type Props = { answers: Answers; params: PolicyParams; verdict: Verdict };

const THRESHOLD_OF: Record<string, keyof Pick<PolicyParams, "junkBelow" | "securityAbove" | "outageAbove">> = {
  has_request: "junkBelow",
  is_security_or_data_loss: "securityAbove",
  is_outage: "outageAbove",
};

export function EvidenceGates({ answers, params, verdict }: Props) {
  const tripped: Record<string, boolean> = {
    has_request: verdict.isJunk,
    is_security_or_data_loss: verdict.isSecurity,
    is_outage: verdict.isOutage,
  };

  return (
    <section className="mb-7">
      <h3 className="cap mb-3 flex items-baseline gap-2 text-ink-3">
        Gates
        <span className="text-[11px] font-light tracking-normal normal-case text-ink-3">
          noul · tick marks the threshold
        </span>
      </h3>

      {GATE_KEYS.map((key) => {
        const value = answers[key].noul;
        const threshold = params[THRESHOLD_OF[key] as keyof PolicyParams] as number;
        const hit = tripped[key] ?? false;
        return (
          <div
            key={key}
            className="mb-2.5 grid items-center gap-3 sm:grid-cols-[minmax(0,11.5rem)_minmax(0,1fr)_3.25rem]"
          >
            <span className="text-xs text-ink-2">{GATE_LABEL[key]}</span>
            <Progress
              value={value * 100}
              aria-label={`${GATE_LABEL[key]}, threshold ${threshold.toFixed(2)}`}
              mark={threshold * 100}
              className="block"
              // has_request is the one gate where a high reading is the good
              // outcome, so a passing bar reads as normal rather than neutral
              indicatorClassName={hit ? "bg-p-urgent" : key === "has_request" ? "bg-p-normal" : "bg-p-low"}
            />
            <Counter
              value={value}
              className={`num text-right text-[11px] tabular-nums ${hit ? "font-medium text-p-urgent" : "text-ink-2"}`}
            />
          </div>
        );
      })}

      {verdict.isJunk && (
        <p className="mt-3 max-w-[var(--measure)] border-l-2 border-p-urgent pl-2 text-[11.5px] leading-relaxed text-ink-3">
          has_request fell below junkBelow, so the junk branch fired and everything below is bypassed.
        </p>
      )}
    </section>
  );
}
