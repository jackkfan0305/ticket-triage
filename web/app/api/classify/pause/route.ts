import { z } from "zod";
import { setPaused } from "@/lib/run-pause";

export const runtime = "nodejs";

/**
 * Holds or releases a run that is already streaming.
 *
 * The run's own response is open for its whole duration and carries nothing
 * upstream, so the pause needs a request of its own.
 */
const Body = z.object({ runId: z.string().min(1), paused: z.boolean() });

export async function POST(request: Request): Promise<Response> {
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

  // A run id nobody is streaming is not an error: the run can have finished
  // between the click and this request.
  setPaused(parsed.data.runId, parsed.data.paused);
  return new Response(null, { status: 204 });
}
