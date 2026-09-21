"use client";

import { DEFAULT_PARAMS } from "../../../src/triage/policy";
import type { Ticket } from "../../../src/types";
import { useRunStore } from "@/components/run-store";
import type { Row, RunResult } from "@/lib/rows";
import { BackLink } from "./back-link";
import { Detail } from "./detail";

const rowOf = (ticket: Ticket, live: RunResult): Row => ({
  id: ticket.id,
  subject: ticket.subject,
  body: ticket.body,
  live,
  pending: false,
  own: false,
});

function UnclassifiedTicket({ ticket }: { ticket: Ticket }) {
  return (
    <div className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <article className="min-w-0">
        <p className="mb-3 text-meta text-ink-3">Customer message</p>
        <h2 className="text-display leading-snug font-medium text-balance break-words">
          {ticket.subject || "Untitled ticket"}
        </h2>
        <p className="mt-4 max-w-[66ch] text-body leading-relaxed whitespace-pre-wrap text-pretty break-words text-ink-2">
          {ticket.body}
        </p>
      </article>
      <dl className="space-y-5 border-l border-line pl-5 text-meta">
        <div>
          <dt className="mb-1 text-ink-3">Ticket ID</dt>
          <dd className="num text-ink">{ticket.id}</dd>
        </div>
        <div>
          <dt className="mb-1 text-ink-3">Classification</dt>
          <dd className="flex items-center gap-2 text-ink-2">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-ink-3" />
            Not classified
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function TicketPage({ ticket }: { ticket: Ticket }) {
  const { results } = useRunStore();
  const result = results.get(ticket.id);

  return (
    <main className="gutter pt-6 pb-18">
      <header className="border-b border-line-soft pb-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <BackLink href="/" label="Triage floor" />
          <span aria-hidden="true" className="text-line">/</span>
          <h1 className="m-0 text-heading font-medium">Ticket Triage</h1>
        </div>
      </header>
      {result ? (
        <Detail row={rowOf(ticket, result)} params={DEFAULT_PARAMS} />
      ) : (
        <UnclassifiedTicket ticket={ticket} />
      )}
    </main>
  );
}
