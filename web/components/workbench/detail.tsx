"use client";

import { useRef } from "react";
import type { PolicyParams } from "../../../src/triage/policy";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/motion";
import { answersOf, verdictOf, type Row } from "@/lib/rows";
import { EvidenceDecision } from "./evidence-decision";
import { EvidenceGates } from "./evidence-gates";
import { EvidenceScores } from "./evidence-scores";
import { EvidenceTeam } from "./evidence-team";
import { EvidenceUrgency } from "./evidence-urgency";

type DetailProps = {
  row: Row | null;
  params: PolicyParams;
};

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
        <p className="py-12 text-center text-meta text-ink-3" aria-live="polite">
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
  return (
    <div className="min-w-0">
      <div className="evidence-step grid gap-8 border-b border-line py-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <header className="min-w-0">
          <p className="mb-3 text-meta text-ink-3">{row.own ? "Your ticket" : "Customer message"}</p>
          <h2 className="text-display leading-snug font-medium text-balance break-words">
            {row.subject || "Untitled ticket"}
          </h2>
          <p className="mt-4 max-w-[66ch] text-body leading-relaxed whitespace-pre-wrap text-pretty break-words text-ink-2">
            {row.body}
          </p>
        </header>
        <div className="min-w-0 border-l-2 border-line pl-5">
          <EvidenceDecision verdict={verdict} />
        </div>
      </div>

      <div className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-12">
        <div className="evidence-step min-w-0">
          <EvidenceUrgency answers={answers} params={params} verdict={verdict} />
          <EvidenceGates answers={answers} params={params} verdict={verdict} />
        </div>
        <div className="evidence-step min-w-0">
          <EvidenceTeam answers={answers} params={params} isJunk={verdict.isJunk} />
        </div>
      </div>
      <div className="evidence-step border-t border-line pt-6">
        <EvidenceScores answers={answers} />
      </div>
    </div>
  );
}
