"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_PARAMS } from "../../../src/triage/policy";
import type { Ticket } from "../../../src/types";
import { useRunStore } from "@/components/run-store";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { classify } from "@/lib/classify";
import type { Row, RunResult } from "@/lib/rows";
import { BackLink } from "./back-link";
import { Detail } from "./detail";

const rowOf = (ticket: Ticket, live: RunResult | null): Row => ({
  id: ticket.id,
  subject: ticket.subject,
  body: ticket.body,
  live,
  pending: false,
  own: false,
});

/**
 * The evidence behind one ticket, at its own address.
 *
 * Two entry paths, and the page says which one it took. A soft navigation from
 * the floor arrives with the run's own answer already in the store. A cold load
 * has an empty store, because no answers are persisted between reloads, so this
 * classifies the one ticket it is about. One ticket, one request.
 *
 * The verdict is read under the default policy. The thresholds on the floor are
 * that page's own state and do not reach across a route.
 */
export function TicketPage({ ticket }: { ticket: Ticket }) {
  const { results, record } = useRunStore();
  const stored = results.get(ticket.id);

  // captured on mount, so recording the answer does not relabel the page
  const [fromRun] = useState(() => stored !== undefined);
  const [result, setResult] = useState<RunResult | null>(stored ?? null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // a ref, not a disabled lint rule: strict mode invokes the effect twice and
  // the second pass must not send a second request
  const asked = useRef(false);

  useEffect(() => {
    if (stored || asked.current) return;
    asked.current = true;
    classify({ subject: ticket.subject, body: ticket.body })
      .then((answer) => {
        record(ticket.id, answer);
        setResult(answer);
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Classification failed.");
      });
  }, [ticket, stored, record, attempt]);

  const retry = () => {
    asked.current = false;
    setError(null);
    setAttempt((count) => count + 1);
  };

  return (
    <main className="gutter pt-8 pb-18">
      <div className="flex flex-wrap items-center gap-2.5 pb-3">
        <BackLink href="/" label="Triage floor" />
        <h1 className="m-0 text-[15px] font-medium tracking-tight">Ticket Triage</h1>
        <span className="num text-[11px] text-ink-3">{ticket.id}</span>
      </div>

      <p className="num m-0 border-b border-line-soft pb-3 text-[11px] text-ink-3">
        {error
          ? "No evidence: the classifier did not answer."
          : result === null
            ? "No answer for this ticket in this session. Asking the model now."
            : fromRun
              ? `From this session's run · ${result.latencyMs} ms measured`
              : `Classified on open · ${result.latencyMs} ms`}
      </p>

      {error ? (
        <div className="py-10" role="alert">
          <p className="m-0 text-[13px] text-p-urgent">{error}</p>
          <Button variant="outline" size="sm" onClick={retry} className="mt-3 h-8 text-xs">
            Try again
          </Button>
        </div>
      ) : result === null ? (
        <div className="py-6" aria-live="polite">
          <span className="sr-only">Classifying this ticket.</span>
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="mt-2 h-4 w-full" />
          <Skeleton className="mt-1.5 h-4 w-5/6" />
          <Skeleton className="mt-6 h-20 w-full" />
          <Skeleton className="mt-4 h-40 w-full" />
        </div>
      ) : (
        // the route has its own way back; Detail must not draw a second one
        <Detail row={rowOf(ticket, result)} params={DEFAULT_PARAMS} />
      )}
    </main>
  );
}
