"use client";

import type { PolicyParams } from "../../../src/triage/policy";
import type { Answers } from "../../../src/types";
import { TEAM_OPTIONS, humanTeam } from "@/lib/labels";
import { Progress } from "@/components/ui/progress";

type Props = { answers: Answers; params: PolicyParams; isJunk?: boolean };

export function EvidenceTeam({ answers, params, isJunk = false }: Props) {
  const team = answers.team;
  const floor = params.teamConfidenceFloor;
  const ranked = [...TEAM_OPTIONS].sort((a, b) => (team.probabilities[b] ?? 0) - (team.probabilities[a] ?? 0));
  const passes = !isJunk && team.choice !== "none" && team.confidence >= floor;

  return (
    <section className="min-w-0">
      <h3 className="text-heading font-medium text-balance">Team routing</h3>
      <p className="mt-1 mb-6 text-meta text-pretty text-ink-3">
        {isJunk ? "Routing skipped. No actionable request detected." : passes ? `Assigned to ${humanTeam(team.choice)}.` : "Held for manual triage."}
      </p>

      {ranked.map((option) => {
        const probability = team.probabilities[option] ?? 0;
        const won = option === team.choice;
        return (
          <div
            key={option}
            className="mb-4 grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_2.75rem] items-center gap-3"
          >
            <span
              className={`num truncate text-micro ${won ? "font-medium text-ink" : "text-ink-2"}`}
              title={option}
            >
              {humanTeam(option)}
            </span>
            <Progress
              value={probability * 100}
              aria-label={`${option} probability`}
              className="block"
              trackClassName="h-2 rounded-[2px]"
              indicatorClassName={`rounded-[2px] ${won ? "bg-brand" : "bg-ink-3"}`}
            />
            <span className="num text-right text-micro text-ink-3">{Math.round(probability * 100)}%</span>
          </div>
        );
      })}

      <div className="mt-6 border-t border-line-soft pt-4">
        <div className="mb-3 flex justify-between gap-2 text-meta">
          <span className="text-ink-2">Routing confidence</span>
          <span className="num">{Math.round(team.confidence * 100)}%</span>
        </div>
        <Progress value={team.confidence * 100} mark={floor * 100} aria-label={`Routing confidence, minimum ${Math.round(floor * 100)} percent`} indicatorClassName="bg-brand" />
        <p className="mt-3 text-meta text-pretty text-ink-3">
          {isJunk ? "Team suggestions do not affect the decision for this ticket." : team.choice === "none" ? "The model did not select a team." : passes ? `Meets the ${Math.round(floor * 100)}% minimum for automatic routing.` : `Below the ${Math.round(floor * 100)}% minimum. Review the suggested team before assigning.`}
        </p>
      </div>
    </section>
  );
}
