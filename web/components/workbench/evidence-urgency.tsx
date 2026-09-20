"use client";

import type { PolicyParams } from "../../../src/triage/policy";
import type { Answers } from "../../../src/types";
import { TOP } from "@/lib/labels";
import type { Verdict } from "@/lib/rows";
import { Counter } from "./counter";

type Props = { answers: Answers; params: PolicyParams; verdict: Verdict };

const BAND_TONE: Record<string, string> = {
  low: "bg-p-low",
  normal: "bg-p-normal",
  high: "bg-p-high",
  urgent: "bg-p-urgent",
};

export function EvidenceUrgency({ answers, params, verdict }: Props) {
  const { weights, thresholds } = params;
  const u = verdict.urgency;

  const bands = [
    { name: "low", from: 0, to: Math.max(0, thresholds.normal) },
    { name: "normal", from: thresholds.normal, to: Math.max(thresholds.normal, thresholds.high) },
    { name: "high", from: thresholds.high, to: Math.max(thresholds.high, thresholds.urgent) },
    { name: "urgent", from: thresholds.urgent, to: 1 },
  ];

  return (
    <section className="mb-7">
      <h3 className="cap mb-3 flex items-baseline gap-2 text-ink-3">
        Urgency
        <span className="text-[11px] font-light tracking-normal normal-case text-ink-3">
          recomputed in-browser on every drag
        </span>
      </h3>

      <p className="num overflow-x-auto whitespace-nowrap pb-0.5 text-xs leading-loose text-ink-2">
        <span className="text-ink-3">impact</span> {weights.impact.toFixed(2)} × {answers.impact_severity.score}/
        {TOP.impact_severity} <span className="text-ink-3">+</span> <span className="text-ink-3">time</span>{" "}
        {weights.time.toFixed(2)} × {answers.time_pressure.score}/{TOP.time_pressure}{" "}
        <span className="text-ink-3">+</span> <span className="text-ink-3">frustr</span>{" "}
        {weights.frustration.toFixed(2)} × {answers.customer_frustration.score}/{TOP.customer_frustration}{" "}
        <span className="text-ink-3">=</span>{" "}
        <Counter value={u} places={4} className="num text-[13.5px] font-medium text-ink" />
      </p>

      {/* container query unit lets the needle ride on a transform instead of `left` */}
      <div
        className="relative mt-3 h-10"
        style={{ containerType: "inline-size" }}
        role="img"
        aria-label={`Urgency ${u.toFixed(4)}, in the ${verdict.isJunk || verdict.isSecurity || verdict.isOutage ? "bypassed" : "current"} band ruler`}
      >
        {bands.map((band) => {
          const width = Math.max(0, band.to - band.from);
          return (
            <span
              key={band.name}
              aria-hidden="true"
              className={`absolute top-0 h-3.5 rounded-[2px] opacity-85 ${BAND_TONE[band.name]}`}
              style={{ left: `${band.from * 100}%`, width: `${width * 100}%` }}
            >
              {width > 0.08 && (
                <span className="cap absolute top-[17px] left-0 text-[11px] font-normal tracking-[0.04em] text-ink-3">
                  {band.name}
                </span>
              )}
            </span>
          );
        })}
        <span
          aria-hidden="true"
          className="absolute top-[-4px] -left-px h-[21px] w-0.5 rounded-[1px] bg-ink motion-safe:transition-transform motion-safe:duration-[--duration-normal] motion-safe:ease-[--ease-out-expo] after:absolute after:-top-1 after:-left-[3px] after:border-4 after:border-transparent after:border-t-ink after:content-['']"
          style={{ transform: `translateX(calc(${Math.min(1, Math.max(0, u))} * 100cqw))` }}
        />
      </div>

      {(verdict.isSecurity || verdict.isOutage) && (
        <p className="mt-3 max-w-[var(--measure)] border-l-2 border-p-urgent pl-2 text-[11.5px] leading-relaxed text-ink-3">
          Gate override: {verdict.isSecurity ? "security/data-loss" : "outage"} tripped, so urgency is bypassed and
          priority is forced to urgent.
        </p>
      )}
    </section>
  );
}
