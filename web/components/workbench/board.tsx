"use client";

import { useRef } from "react";
import type { PolicyParams } from "../../../src/triage/policy";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { humanTeam } from "@/lib/labels";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/motion";
import { answersOf, verdictOf, type Row } from "@/lib/rows";
import { PRIORITY_STRIPE, PriorityChip } from "./priority";

type BoardProps = {
  rows: readonly Row[];
  params: PolicyParams;
  onOpen: (id: string) => void;
};

export function Board({ rows, params, onOpen }: BoardProps) {
  const scope = useRef<HTMLDivElement>(null);
  const animated = useRef(new Set<string>());

  // Rows land one at a time during a live run, so each newly resolved row gets
  // its own entrance rather than the whole board re-animating.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const candidates = scope.current?.querySelectorAll<HTMLElement>("tr[data-resolved='true']");
      if (!candidates) return;
      const fresh = [...candidates].filter((node) => {
        const id = node.dataset.rowId;
        if (!id || animated.current.has(id)) return false;
        animated.current.add(id);
        return true;
      });
      if (fresh.length === 0) return;
      gsap.from(fresh, { autoAlpha: 0, y: 5, duration: 0.3, stagger: 0.02, ease: "power2.out" });
    },
    { dependencies: [rows], scope },
  );

  if (rows.length === 0) {
    return (
      <p className="py-10 text-xs text-ink-3">No ticket matches this filter under the current thresholds.</p>
    );
  }

  return (
    <div ref={scope}>
      <Table className="w-full border-separate border-spacing-0 text-sm">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-auto pb-2 pl-3.5 num text-[11px] tracking-[0.05em] uppercase text-ink-3">
              Ticket
            </TableHead>
            <TableHead className="h-auto w-20 pb-2 text-right num text-[11px] tracking-[0.05em] uppercase text-ink-3">
              Priority
            </TableHead>
            <TableHead className="hidden h-auto w-36 pb-2 text-right num text-[11px] tracking-[0.05em] uppercase text-ink-3 sm:table-cell">
              Team
            </TableHead>
            <TableHead className="hidden h-auto w-[4.5rem] pb-2 text-right num text-[11px] tracking-[0.05em] uppercase text-ink-3 md:table-cell">
              Urgency
            </TableHead>
            <TableHead className="hidden h-auto w-[4.5rem] pb-2 text-right num text-[11px] tracking-[0.05em] uppercase text-ink-3 md:table-cell">
              Latency
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row) => {
            const answers = answersOf(row);
            const verdict = answers ? verdictOf(answers, params) : null;
            const latency = row.live?.latencyMs ?? null;
            const resolved = !row.pending && verdict !== null;

            return (
              <TableRow
                key={row.id}
                data-row-id={row.id}
                data-resolved={resolved ? "true" : "false"}
                className={`group relative border-0 transition-colors hover:bg-panel has-focus-visible:bg-panel ${
                  row.pending ? "opacity-40" : ""
                }`}
              >
                {/* max-w-0 with w-full lets the subject truncate to the column
                    instead of forcing the table past the viewport */}
                <TableCell className="relative w-full max-w-0 py-2.5 pl-3.5 whitespace-normal">
                  <span
                    aria-hidden="true"
                    className={`absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-[2px] ${
                      verdict ? PRIORITY_STRIPE[verdict.priority] : "bg-track"
                    }`}
                  />
                  {/* one real button per row; its ::after covers the whole row so
                      the click target matches what the eye sees */}
                  <button
                    type="button"
                    onClick={() => onOpen(row.id)}
                    className="block w-full min-w-0 text-left after:absolute after:inset-0 after:content-['']"
                  >
                    <span className="num block text-[11px] text-ink-3">
                      {row.own ? "yours · " : ""}
                      {row.id}
                    </span>
                    <span className="mt-px block truncate text-[13.5px] text-ink" title={row.subject}>
                      {row.subject || "(untitled)"}
                    </span>
                    {/* the team column is gone at this width, so the value moves
                        under the subject rather than disappearing */}
                    {verdict && (
                      <span
                        className={`num mt-0.5 block truncate text-[11px] sm:hidden ${
                          verdict.team === null ? "text-p-high" : "text-ink-2"
                        }`}
                      >
                        {verdict.team === null ? "needs-triage" : humanTeam(verdict.team)}
                      </span>
                    )}
                  </button>
                </TableCell>

                <TableCell className="py-2.5 text-right">
                  {row.pending ? (
                    <span className="num text-[11px] text-ink-3">…</span>
                  ) : verdict ? (
                    <PriorityChip priority={verdict.priority} />
                  ) : null}
                </TableCell>

                <TableCell
                  className={`hidden truncate py-2.5 text-right num text-[11px] sm:table-cell ${
                    verdict?.team === null ? "text-p-high" : "text-ink-2"
                  }`}
                >
                  {verdict === null ? "" : (verdict.team === null ? "needs-triage" : humanTeam(verdict.team))}
                </TableCell>

                <TableCell className="hidden py-2.5 text-right num text-[11px] text-ink-3 md:table-cell">
                  {verdict === null ? "" : verdict.urgency.toFixed(3)}
                </TableCell>

                <TableCell className="hidden py-2.5 text-right num text-[11px] text-ink-3 md:table-cell">
                  {latency === null ? "—" : `${latency} ms`}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
