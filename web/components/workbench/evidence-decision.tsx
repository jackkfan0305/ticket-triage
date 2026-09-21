"use client";

import type { Verdict } from "@/lib/rows";
import { meaningfulTags } from "@/lib/rows";
import { PriorityMarker } from "./priority-marker";

export function EvidenceDecision({ verdict }: { verdict: Verdict }) {
  const tags = meaningfulTags(verdict.tags);

  return (
    <section className="min-w-0">
      <h3 className="mb-3 text-meta text-ink-3">Triage decision</h3>

      <dl className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div data-stat="priority" className="flex flex-col gap-1">
          <dt className="num text-micro tracking-[0.07em] uppercase text-ink-3">priority</dt>
          <dd className="num text-display font-medium capitalize text-ink">
            <span className="inline-flex items-center gap-2">
              <PriorityMarker priority={verdict.priority} />
              {verdict.priority}
            </span>
            <span className="mt-1 block text-micro font-normal normal-case text-ink-2">
              {verdict.isJunk ? "No actionable request" : verdict.isSecurity ? "Security report" : verdict.isOutage ? "Service outage" : `from urgency ${verdict.urgency.toFixed(3)}`}
            </span>
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="num text-micro tracking-[0.07em] uppercase text-ink-3">team</dt>
          <dd className="num text-body font-medium text-ink">
            {verdict.team?.replace(/_/g, " ") ?? "Needs triage"}
          </dd>
        </div>
      </dl>

      {tags.length > 0 && (
        <ul className="mt-2.5 flex list-none flex-wrap gap-1 p-0">
          {tags.map((tag) => (
            <li
              key={tag}
              className="num rounded-[3px] border border-line bg-panel-2 px-1.5 py-0.5 text-micro text-ink-2"
            >
              {tag}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
