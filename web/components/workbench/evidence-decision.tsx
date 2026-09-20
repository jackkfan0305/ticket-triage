"use client";

import type { Verdict } from "@/lib/rows";
import { meaningfulTags } from "@/lib/rows";
import { PRIORITY_TEXT } from "./priority";

const WARN = /needs-triage|junk|security|guess/;

export function EvidenceDecision({ verdict }: { verdict: Verdict }) {
  const tags = meaningfulTags(verdict.tags);

  return (
    <section className="mb-7">
      <h3 className="cap mb-3 text-ink-3">Decision</h3>

      <dl className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="flex flex-col gap-0.5">
          <dt className="num text-[11px] tracking-[0.07em] uppercase text-ink-3">priority</dt>
          <dd className={`num text-[19px] font-medium tracking-tight uppercase ${PRIORITY_TEXT[verdict.priority]}`}>
            {verdict.priority}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="num text-[11px] tracking-[0.07em] uppercase text-ink-3">team</dt>
          <dd className={`num text-sm font-medium ${verdict.team === null ? "text-p-high" : "text-ink"}`}>
            {verdict.team ?? "— needs-triage"}
          </dd>
        </div>
      </dl>

      {tags.length > 0 && (
        <ul className="mt-2.5 flex list-none flex-wrap gap-1 p-0">
          {tags.map((tag) => (
            <li
              key={tag}
              className={`num rounded-[3px] border px-1.5 py-0.5 text-[11px] ${
                WARN.test(tag)
                  ? "border-[var(--warn-line)] bg-warn-bg text-warn-ink"
                  : "border-line bg-panel-2 text-ink-2"
              }`}
            >
              {tag}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
