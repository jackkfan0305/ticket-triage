"use client";

import type { PolicyParams } from "../../../src/triage/policy";
import type { Answers, Priority } from "../../../src/types";
import { TOP } from "@/lib/labels";
import { nearestEdge, type Verdict } from "@/lib/rows";
import { PriorityMarker } from "./priority-marker";

type Props = { answers: Answers; params: PolicyParams; verdict: Verdict };

const BAND_TONE: Record<Priority, string> = {
  low: "bg-ink/15",
  normal: "bg-ink/30",
  high: "bg-ink/50",
  urgent: "bg-ink/75",
};

export function EvidenceUrgency({ answers, params, verdict }: Props) {
  const { weights, thresholds } = params;
  const u = verdict.urgency;
  const bypassed = verdict.isJunk || verdict.isSecurity || verdict.isOutage;
  const edge = nearestEdge(u, thresholds);
  const factors = [
    { label: "Impact", score: answers.impact_severity.score, top: TOP.impact_severity, weight: weights.impact, tone: "bg-ink" },
    { label: "Time pressure", score: answers.time_pressure.score, top: TOP.time_pressure, weight: weights.time, tone: "bg-ink-2" },
    { label: "Frustration", score: answers.customer_frustration.score, top: TOP.customer_frustration, weight: weights.frustration, tone: "bg-ink-3" },
  ];
  const bands: { name: Priority; from: number; to: number }[] = [
    { name: "low", from: 0, to: thresholds.normal },
    { name: "normal", from: thresholds.normal, to: thresholds.high },
    { name: "high", from: thresholds.high, to: thresholds.urgent },
    { name: "urgent", from: thresholds.urgent, to: 1 },
  ];

  return (
    <section className="mb-8" aria-label="Urgency breakdown">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-heading font-medium text-balance">What drives the priority</h3>
        <p className="num text-title font-medium">{u.toFixed(3)} <span className="text-micro font-normal text-ink-3">/ 1.000</span></p>
      </div>
      <p className="mt-1 text-meta text-pretty text-ink-3">
        {bypassed ? "The checks below override this score." : `${edge.distance.toFixed(3)} ${edge.above ? "above" : "below"} the ${edge.name} threshold.`}
      </p>

      <div className="relative mt-6 mb-5" role="img" aria-label={`Urgency ${u.toFixed(3)} out of 1. Low below ${thresholds.normal}, normal from ${thresholds.normal}, high from ${thresholds.high}, urgent from ${thresholds.urgent}.${bypassed ? " Score does not determine this ticket's priority." : ""}`}>
        <div className="relative h-5 overflow-hidden rounded-sm bg-track" aria-hidden="true">
          {bands.map((band) => (
            <span key={band.name} className={`absolute inset-y-0 ${BAND_TONE[band.name]}`} style={{ left: `${band.from * 100}%`, width: `${Math.max(0, band.to - band.from) * 100}%` }} />
          ))}
        </div>
        <span aria-hidden="true" className="absolute -top-1 h-7 w-0.5 -translate-x-1/2 bg-ink ring-2 ring-background" style={{ left: `${Math.min(1, Math.max(0, u)) * 100}%` }} />
        <div className="mt-2 flex justify-between text-micro text-ink-3" aria-hidden="true">
          {bands.map((band) => (
            <span key={band.name} className="flex flex-col items-center gap-1 capitalize text-ink-2 sm:flex-row">
              <PriorityMarker priority={band.name} />
              {band.name}
            </span>
          ))}
        </div>
      </div>

      <div className="mb-2 flex justify-between text-micro text-ink-3"><span>Score contribution</span><span>Weighted points</span></div>
      <ul className="space-y-3">
        {factors.map((factor) => {
          const contribution = factor.weight * factor.score / factor.top;
          return (
            <li key={factor.label} className="grid grid-cols-[6rem_minmax(0,1fr)_2.75rem] items-center gap-3">
              <span className="text-meta text-ink-2">{factor.label}</span>
              <div className="h-2 bg-track" role="img" aria-label={`${factor.label}: ${factor.score.toFixed(2)} out of ${factor.top}, weight ${factor.weight.toFixed(2)}, contributes ${contribution.toFixed(3)} points`}>
                <div className={`h-full ${factor.tone}`} style={{ width: `${Math.min(1, Math.max(0, contribution)) * 100}%` }} />
              </div>
              <span className="num text-right text-meta">{contribution.toFixed(3)}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-micro text-pretty text-ink-3">Each bar uses the same 0 to 1 scale. Score ÷ maximum × weight = contribution.</p>
      {bypassed && (
        <p className="mt-4 border-l-2 border-ink pl-3 text-meta text-pretty text-ink-2">
          {verdict.isJunk ? "No actionable request detected. Priority is low and the ticket stays in triage." : `Priority is forced by ${verdict.isSecurity ? "security" : "outage"} gate. The ticket is urgent regardless of its score.`}
        </p>
      )}
    </section>
  );
}
