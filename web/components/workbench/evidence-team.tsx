"use client";

import type { PolicyParams } from "../../../src/triage/policy";
import type { Answers } from "../../../src/types";
import { TEAM_OPTIONS } from "@/lib/labels";
import { Progress } from "@/components/ui/progress";

type Props = { answers: Answers; params: PolicyParams };

export function EvidenceTeam({ answers, params }: Props) {
  const team = answers.team;
  const floor = params.teamConfidenceFloor;
  const ranked = [...TEAM_OPTIONS].sort((a, b) => (team.probabilities[b] ?? 0) - (team.probabilities[a] ?? 0));
  const passes = team.choice !== "none" && team.confidence >= floor;

  return (
    <section className="mb-7">
      <h3 className="cap mb-3 flex items-baseline gap-2 text-ink-3">
        Team routing
        <span className="text-[11px] font-light tracking-normal normal-case text-ink-3">
          choice · confidence vs floor
        </span>
      </h3>

      {ranked.map((option) => {
        const probability = team.probabilities[option] ?? 0;
        const won = option === team.choice;
        return (
          <div
            key={option}
            className="mb-1.5 grid items-center gap-3 sm:grid-cols-[minmax(0,9.75rem)_minmax(0,1fr)_2.75rem]"
          >
            <span
              className={`num truncate text-[11px] ${won ? "font-medium text-ink" : "text-ink-2"}`}
              title={option}
            >
              {option}
            </span>
            <Progress
              value={probability * 100}
              aria-label={`${option} probability`}
              className="block"
              trackClassName="h-2 rounded-[2px]"
              indicatorClassName={`rounded-[2px] ${won ? "bg-brand" : "bg-ink-3"}`}
            />
            <span className="num text-right text-[11px] text-ink-3">{probability.toFixed(2)}</span>
          </div>
        );
      })}

      <p className="num mt-2 flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-2 text-[11px] text-ink-2">
        confidence <b className="font-medium">{team.confidence.toFixed(2)}</b> vs floor{" "}
        <b className="font-medium">{floor.toFixed(2)}</b> →{" "}
        <span className={passes ? "font-medium text-p-normal" : "font-medium text-p-high"}>
          {team.choice === "none"
            ? "no team owns this"
            : passes
              ? `routed to ${team.choice}`
              : "below floor, held for triage"}
        </span>
      </p>
    </section>
  );
}
