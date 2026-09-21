import { z } from "zod";
import { askJev } from "../../../../../src/triage/run";
import { API_KEY_NAME, concurrency, hasApiKey } from "@/lib/env";
import { jevClient } from "@/lib/jev-client";
import { pooled } from "@/lib/pool";
import { forget, holdWhilePaused } from "@/lib/run-pause";
import { TicketInput } from "@/lib/ticket-input";

// askJev builds a TypeSafeClient, which is server-only and holds the API key.
export const runtime = "nodejs";

/**
 * The whole run, fanned out here rather than in the browser.
 *
 * A browser opens at most six connections to one origin over HTTP/1.1, so a
 * client-side pool of eight only ever reached 5.8 in flight and a 100 ticket
 * run took 18.3s against 106s of model time. One connection carrying every
 * ticket lifts that cap: the pool below is the only limit left, and it is a
 * number this process controls.
 *
 * The response is NDJSON, one line per event, so tickets still land one at a
 * time on the floor instead of arriving together at the end.
 */
const Body = z.object({
  runId: z.string().min(1),
  // the floor's largest sample is 1000 tickets
  tickets: z.array(TicketInput.extend({ id: z.string().min(1) })).min(1).max(1000),
});

export async function POST(request: Request): Promise<Response> {
  // A missing key is a deployment fault, not an upstream one. A hundred tickets
  // reporting "upstream" when nothing was ever sent hides the real cause.
  if (!hasApiKey()) {
    return Response.json(
      { error: `${API_KEY_NAME} is not set. Add it to the repo-root .env and restart the server.` },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const parsed = Body.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }

  const { runId, tickets } = parsed.data;
  const limit = concurrency();
  // One client for the whole run, on a dispatcher that survives concurrency.
  const client = jevClient();
  const encoder = new TextEncoder();

  // Flipped when the browser drops the response, so nothing tries to write to
  // a stream that has no reader.
  let open = true;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => {
        if (open) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      // the floor says how many tickets are with the model, and only the
      // server knows that number now
      send({ type: "open", concurrency: limit });

      await pooled(
        tickets,
        limit,
        async (ticket) => {
          // Pause holds at the next ticket rather than cancelling anything
          // already with the model, so every latency reported is a real one.
          await holdWhilePaused(runId, request.signal);
          if (!open || request.signal.aborted) throw new Error("run abandoned");
          send({ type: "start", id: ticket.id });

          // measured around askJev alone, so the number is model time rather
          // than the browser's round trip or its wait in this pool
          const started = performance.now();
          const { model, answers } = await askJev(ticket, client);
          return { model, answers, latencyMs: Math.round(performance.now() - started) };
        },
        ({ item, value, error }) => {
          if (value) {
            send({ type: "done", id: item.id, ...value });
            return;
          }
          if (!open || request.signal.aborted) return;
          // the message can carry provider detail, so it stays in the server log
          console.error("classify failed", item.id, error);
          send({ type: "error", id: item.id, error: "Classification failed upstream." });
        },
      );

      forget(runId);
      if (open) controller.close();
      open = false;
    },
    cancel() {
      open = false;
      forget(runId);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      // tells a proxy to pass chunks through instead of collecting the run
      "x-accel-buffering": "no",
    },
  });
}
