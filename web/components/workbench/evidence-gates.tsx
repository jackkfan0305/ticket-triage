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
    <section className="border-t border-line-soft pt-5">
      <h3 className="mb-4 flex flex-wrap items-baseline gap-2 text-heading font-medium text-balance">
        Priority checks
        <span className="text-micro font-light tracking-normal normal-case text-ink-3">
          Tick marks the cutoff
        </span>
      </h3>

      {GATE_KEYS.map((key) => {
        const value = answers[key].noul;
        const threshold = params[THRESHOLD_OF[key] as keyof PolicyParams] as number;
        const hit = tripped[key] ?? false;
        return (
          <div
            key={key}
            className="mb-2.5 grid items-center gap-3 grid-cols-[minmax(0,8rem)_minmax(0,1fr)_2.5rem]"
          >
            <span className="text-meta text-ink-2">{key === "has_request" ? "Actionable request" : GATE_LABEL[key]}</span>
            <Progress
              value={value * 100}
              aria-label={`${GATE_LABEL[key]}, threshold ${threshold.toFixed(2)}`}
              mark={threshold * 100}
              className="block"
              indicatorClassName={hit ? "bg-ink" : "bg-ink-3"}
            />
            <Counter
              value={value}
              className={`num text-right text-micro tabular-nums ${hit ? "font-medium text-ink" : "text-ink-2"}`}
            />
          </div>
        );
      })}

      {verdict.isJunk && (
        <p className="mt-3 max-w-[var(--measure)] border-l-2 border-ink pl-2 text-meta leading-relaxed text-ink-3">
          The request score is below the cutoff. Urgency and team suggestions do not affect the decision.
        </p>
      )}
    </section>
  );
}
