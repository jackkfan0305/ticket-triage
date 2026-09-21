import { z } from "zod";
import { askJev } from "../../../../src/triage/run";
import { API_KEY_NAME, hasApiKey } from "@/lib/env";
import { jevClient } from "@/lib/jev-client";

// askJev builds a TypeSafeClient, which is server-only and holds the API key.
export const runtime = "nodejs";

const Body = z.object({
  subject: z.string().max(200, "Subject must be 200 characters or fewer.").default(""),
  body: z
    .string()
    .max(5000, "Body must be 5000 characters or fewer.")
    .refine((v) => v.trim().length > 0, "Body is required."),
});

/** Reports whether the key is present, never what it is. */
export function GET(): Response {
  return Response.json({ configured: hasApiKey() });
}

export async function POST(request: Request): Promise<Response> {
  // A missing key is a deployment fault, not an upstream one. Sixty tickets
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

  const ticket = { id: "adhoc", subject: parsed.data.subject, body: parsed.data.body };

  // measured around askJev alone, so the number is model time rather than the
  // browser's round trip to localhost
  const started = performance.now();
  try {
    const { model, answers } = await askJev(ticket, jevClient());
    const latencyMs = Math.round(performance.now() - started);
    return Response.json({ model, answers, latencyMs });
  } catch (error) {
    // the message can carry provider detail, so it stays in the server log
    console.error("classify failed", error);
    return Response.json({ error: "Classification failed upstream." }, { status: 502 });
  }
}
