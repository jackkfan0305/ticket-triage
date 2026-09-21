"use client";

import { useRef } from "react";
import type { PolicyParams } from "../../../src/triage/policy";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/motion";
import { answersOf, leastCertain, nearestEdge, verdictOf, type Row } from "@/lib/rows";
import { Counter } from "./counter";
import { EvidenceDecision } from "./evidence-decision";
import { EvidenceGates } from "./evidence-gates";
import { EvidenceScores } from "./evidence-scores";
import { EvidenceTeam } from "./evidence-team";
import { EvidenceUrgency } from "./evidence-urgency";
import { PRIORITY_TEXT } from "./priority";

type DetailProps = {
  row: Row | null;
  params: PolicyParams;
};

function Stat({
  label,
  children,
  note,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  note?: string;
  tone?: string;
}) {
  return (
    <div data-stat={label.toLowerCase().replace(/\s+/g, "-")}>
      <dt className="num mb-1 block text-[11px] tracking-[0.05em] uppercase text-ink-3">{label}</dt>
      <dd>
        <span className={`num block text-[19px] leading-tight font-medium tracking-tight ${tone ?? "text-ink"}`}>
          {children}
        </span>
        {note && <span className="num mt-0.5 block text-[11px] text-ink-3">{note}</span>}
      </dd>
    </div>
  );
}

export function Detail({ row, params }: DetailProps) {
  const scope = useRef<HTMLDivElement>(null);
  const answers = row ? answersOf(row) : null;

  useGSAP(
    () => {
      if (prefersReducedMotion() || !answers) return;
      gsap.from(".evidence-step", { autoAlpha: 0, y: 8, duration: 0.3, stagger: 0.04, ease: "power2.out" });
    },
    { dependencies: [row?.id, answers !== null], scope, revertOnUpdate: true },
  );

  if (!row) return null;

  return (
    <div ref={scope}>
      {answers === null ? (
        <p className="py-12 text-center text-xs text-ink-3" aria-live="polite">
          Waiting on Jev…
        </p>
      ) : (
        <DetailBody row={row} params={params} answers={answers} />
      )}
    </div>
  );
}

function DetailBody({
  row,
  params,
  answers,
}: {
  row: Row;
  params: PolicyParams;
  answers: NonNullable<ReturnType<typeof answersOf>>;
}) {
  const verdict = verdictOf(answers, params);
  const edge = nearestEdge(verdict.urgency, params.thresholds);
  const weakest = leastCertain(answers);
  const margin = answers.team.confidence - params.teamConfidenceFloor;
  const gated = verdict.isSecurity || verdict.isOutage || verdict.isJunk;
  const latency = row.live?.latencyMs ?? null;


  return (
    <>
      <header className="evidence-step pt-3">
        {row.own && (
          <p className="num mb-1.5 inline-block rounded border border-p-urgent bg-[var(--p-urgent-bg)] px-1.5 py-0.5 text-[11px] tracking-[0.04em] uppercase text-p-urgent">
            yours
          </p>
        )}
        <h2 className="text-[17px] leading-snug font-medium tracking-tight text-balance">
          {row.subject || "(untitled)"}
        </h2>
        <p className="mt-2 max-w-[66ch] text-[13px] leading-relaxed text-ink-2">{row.body}</p>
      </header>

      <dl className="evidence-step mt-4 mb-4 grid gap-x-8 gap-y-3 border-b border-line-soft pb-4 sm:grid-cols-[repeat(auto-fit,minmax(8.25rem,1fr))]">
        <Stat
          label="Latency"
          note={latency === null ? "no live run yet" : "one request, seven questions"}
        >
          {latency === null ? "—" : `${latency} ms`}
        </Stat>
        <Stat
          label="Priority"
          tone={PRIORITY_TEXT[verdict.priority]}
          note={
            verdict.isSecurity
              ? "forced by security gate"
              : verdict.isOutage
                ? "forced by outage gate"
                : verdict.isJunk
                  ? "junk branch"
                  : `from urgency ${verdict.urgency.toFixed(3)}`
          }
        >
          {verdict.priority}
        </Stat>
        <Stat
          label="Nearest edge"
          note={
            gated
              ? "gate bypassed urgency"
              : `${edge.above ? "above" : "below"} ${edge.name} at ${edge.at.toFixed(2)}`
          }
        >
          {gated ? "n/a" : <Counter value={edge.distance} places={3} />}
        </Stat>
        <Stat
          label="Team margin"
          tone={margin >= 0 ? "text-ink" : "text-p-high"}
          note={
            answers.team.choice === "none"
              ? "model chose none"
              : margin >= 0
                ? "clears the floor"
                : "held for triage"
          }
        >
          <Counter value={margin} places={2} prefix={margin >= 0 ? "+" : ""} />
        </Stat>
        <Stat label="Least certain" note={weakest.key}>
          {weakest.confidence.toFixed(2)}
        </Stat>
      </dl>

      <div className="evidence-step">
        <EvidenceGates answers={answers} params={params} verdict={verdict} />
      </div>
      <div className="evidence-step">
        <EvidenceScores answers={answers} />
      </div>
      <div className="evidence-step">
        <EvidenceUrgency answers={answers} params={params} verdict={verdict} />
      </div>
      <div className="evidence-step">
        <EvidenceTeam answers={answers} params={params} />
      </div>
      <div className="evidence-step">
        <EvidenceDecision verdict={verdict} />
      </div>
    </>
  );
}
