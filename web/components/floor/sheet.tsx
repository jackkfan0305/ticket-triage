"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { Priority } from "../../../src/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRIORITY_FILTERS, humanTeam, type FilterKey } from "@/lib/labels";
import { PriorityMarker } from "../workbench/priority-marker";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type SheetEntry = {
  id: string;
  subject: string;
  priority: Priority | null;
  team: string | null;
  urgency: number | null;
  latencyMs: number | null;
  /** queued: the run has not asked about it yet; asking: a request is out */
  status: "queued" | "asking" | "routed";
  /** answered, still crossing the floor */
  transit: boolean;
};

const STATUS_TEXT = { queued: "not asked yet", asking: "asking the model" } as const;
const STATUS_TONE: Partial<Record<SheetEntry["status"], string>> = {
  queued: "text-ink-3",
  asking: "text-brand",
};

type SheetProps = {
  /** null while closed; otherwise the card whose pile this is */
  scope: string | null;
  title: string;
  entries: readonly SheetEntry[];
  filter: FilterKey;
  onFilter: (filter: FilterKey) => void;
  onClose: () => void;
};

/**
 * Every ticket behind one card, as text. The floor shows where work went; this
 * is where a reader reads it, so nothing here opts out of text selection.
 */
export function Sheet({ scope, title, entries, filter, onFilter, onClose }: SheetProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (scope === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [scope, onClose]);

  if (scope === null) return null;

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? entries.filter(
        (entry) =>
          entry.id.toLowerCase().includes(needle) || entry.subject.toLowerCase().includes(needle),
      )
    : entries;

  return (
    <aside
      aria-labelledby="sheet-title"
      className="absolute top-[76px] right-4 bottom-[76px] z-20 flex w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-xl"
    >
      <header className="flex flex-none items-center gap-2 px-4 py-3">
        <h2 id="sheet-title" className="m-0 text-[14px] font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        <span className="num mr-auto text-[11px] text-ink-3">
          {shown.length === 1 ? "1 ticket" : `${shown.length} tickets`}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close ticket list">
          <X aria-hidden="true" className="size-3.5" />
        </Button>
      </header>

      <div className="flex flex-none flex-col gap-3 px-4 pb-3">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search subject or id"
          aria-label="Search tickets"
          className="h-8 rounded-full px-3 text-xs md:text-xs"
        />
        <div className="flex flex-wrap gap-2">
          {PRIORITY_FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={key === filter}
              onClick={() => onFilter(key)}
              className="num inline-flex h-6 items-center gap-1.5 rounded-full border border-line px-2.5 text-[10px] tracking-[0.06em] uppercase text-ink-3 transition-colors duration-[--duration-fast] hover:text-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-background"
            >
              {key !== "all" && key !== "needs-triage" && <PriorityMarker priority={key} />}
              {key}
            </button>
          ))}
        </div>
      </div>

      <ol className="m-0 min-h-0 flex-1 list-none overflow-y-auto px-2 pb-4 [overscroll-behavior:contain]">
        {shown.map((entry) => (
          <li key={entry.id} className="mt-1 first:mt-0">
            {/* a ticket has an address, so a reference to it is a link: it can
                be opened in a tab, bookmarked and shared */}
            <Tooltip>
              <TooltipTrigger
                render={<Link href={`/tickets/${entry.id}`} />}
                className={`flex w-full items-start gap-2 rounded-[10px] px-2 py-2 text-left transition-colors duration-[--duration-fast] hover:bg-panel-2 ${
                  entry.transit ? "opacity-60" : ""
                }`}
              >
                <span className="flex-none self-start pt-0.5 text-ink">
                  <PriorityMarker priority={entry.priority} />
                </span>
                <span className="sr-only">{entry.priority ? `${entry.priority} priority. ` : "Awaiting classification. "}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="num block text-[9.5px] tracking-[0.03em] text-ink-3">{entry.id}</span>
                  <span className="block text-[12px] leading-[1.32] text-ink">
                    {entry.subject || "(untitled)"}
                  </span>
                </span>
                <span
                  className={`num flex-none self-start pt-0.5 text-right text-[10px] ${
                    STATUS_TONE[entry.status] ?? (entry.team === null ? "text-p-high" : "text-ink-2")
                  }`}
                >
                  {entry.status !== "routed"
                    ? STATUS_TEXT[entry.status]
                    : entry.team === null
                      ? "needs triage"
                      : humanTeam(entry.team)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {entry.priority ? `${entry.priority.charAt(0).toUpperCase()}${entry.priority.slice(1)} priority` : "Awaiting classification"}
              </TooltipContent>
            </Tooltip>
          </li>
        ))}

        {shown.length === 0 && (
          <li className="px-2 py-4 text-xs text-ink-3">No ticket here matches that filter.</li>
        )}
      </ol>
    </aside>
  );
}
