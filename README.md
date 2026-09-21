# Ticket Triage

[Try Ticket Triage live](https://ticket-triage-efr1sxms7-jackfan0305-7272s-projects.vercel.app).

A support-ticket classifier with a CLI, an offline policy evaluation workflow, and
an interactive Next.js workbench. It asks TypeSafe's Jev model seven narrow questions
about the ticket text, then applies a TypeScript policy to assign a priority and an
owning team.

Jev supplies the judgments; TypeScript applies the routing and priority rules.
A shared pure function applies the configurable weights and thresholds in the CLI,
evaluation scripts, and browser. Re-scoring existing answers needs no API calls.

## Setup

Needs [Bun](https://bun.sh) 1.3+.

```sh
bun install
```

Add your TypeSafe API key to `.env` in the repository root. Both the CLI and web
app read this file, and Git ignores it.

```dotenv
TYPESAFE_API_KEY=your-api-key
```

## Triage one ticket

```sh
bun run triage --subject "Can't log in" --body "SSO has been failing since this morning."
```

Prints the resolved model and the decision:

```json
{
  "model": "jev-1.13.0",
  "decision": {
    "priority": "high",
    "team": "account_access",
    "tags": ["jev-triaged", "jev-p-high"],
    "evidence": { "...": "raw Jev answers" }
  }
}
```

`evidence` carries every raw answer, so a decision can be re-derived or re-argued
later without asking the model again.

## The workbench

```sh
cd web && bun install && bun dev
```

Open `http://localhost:3000`. The workbench uses Next.js, React, Tailwind CSS,
Base UI components, and GSAP animations.

- Choose 50, 100, 500, or 1000 tickets from the bundled dataset. Start a live run
  and watch tickets move into team piles as results arrive.
- Pan and zoom the canvas, drag piles, scroll their ticket lists, and use Frame
  everything or Tidy to restore the view. Keyboard controls support panning and zoom.
- Open a ticket at `/tickets/[id]` to inspect its text, model evidence, team
  confidence, and priority calculation. The active run continues across navigation.
- Use the compose dialog to classify your own ticket.
- Open developer mode to adjust policy thresholds, weights, and routing confidence.
  Existing answers are re-scored in the browser without another API call. The panel
  also shows the resolved model, per-ticket latency, p50, p95, mean, and run time.
- Pause and resume a run, reset its results, or switch between light and dark themes.
  Pausing stops new requests; tickets already with the model can still finish.

Batch runs use a server-side worker pool and stream results over one NDJSON
connection. This avoids the browser connection limit that constrained the earlier
client-side pool. `TRIAGE_CONCURRENCY` sets the worker count, with a default of 8.
The API key stays on the server.

Run evidence lives in memory and survives navigation within the app, but a hard
reload clears it. The workbench does not load the CLI evaluation cache.

## How a decision is made

Seven questions go out in one `POST /v1/systemone` call over the ticket text.

Three are gates. Junk (no genuine request) drops to `low` and unrouted. A security or
data-loss report, or a full outage, jumps to `urgent`. Gates are separate conditions
rather than weights on purpose: a calmly worded breach report would otherwise average
itself down into `normal`.

Three are scores that feed a weighted urgency, normalised by each question's own top
level: impact severity (0.60), time pressure (0.30), customer frustration (0.10).
Frustration is weighted low because it rewards customers who shout; it also emits a
standalone `jev-frustrated` tag so it can be viewed without distorting priority.

One is a choice over the six-team roster in `src/config/teams.ts` plus `none`. Below
the confidence floor the ticket is left unrouted, with the suppressed guess recorded
as `jev-guess-<team>` so a later "should the floor be lower?" is answerable from data
already on disk.

## Evaluation

```sh
bun run eval                    # fetch missing or stale answers, then score
bun run eval --refresh           # re-fetch every ticket, then score
bun run eval --sweep             # sweep policy parameters over the cache, no network
bun run eval --concurrency 8     # set the evaluation worker count
```

`tests/fixtures/evalset.csv` holds 1000 English tickets drawn uniformly from
[Tobi-Bueck/customer-support-tickets](https://huggingface.co/datasets/Tobi-Bueck/customer-support-tickets),
so the mix is the one the dataset actually has. That leaves 27 Human Resources
tickets in the set, which provide examples outside the six-team roster. Rebuild with
`uv run --with datasets scripts/build_evalset.py`. It refuses to run if the CSV
already holds hand labels, since those are the one thing it cannot regenerate; move
the file aside to force a rebuild.

The dataset's own `priority` and `queue` remain as source metadata, never ground truth.
Ground truth is the `expected_priority` and `expected_team` columns, filled in by hand
against this roster.

The generated answer cache at `tests/fixtures/answers.json` is not bundled in the
repo. A normal run creates it and reuses current entries on later runs. Each entry
records the resolved model and fingerprints the question set and ticket text.
Changes to questions, the embedded team roster, or ticket text make an entry stale.
Use `--refresh` to force new answers, including when comparing model versions.

Each completed answer is saved through an atomic file replacement. Failed requests
do not stop other tickets, and an old answer from a failed refresh is excluded from
that run's scores. A cache write failure stops further fetching.

Fill both `expected_priority` and `expected_team` to score a row. Use `none` for a
team outside the roster. The sweep ranks priority settings by urgent recall, exact
match, and within-one accuracy, and evaluates routing confidence floors separately.
It prints candidate settings without changing `DEFAULT_PARAMS`.

Reported metrics: priority exact and within-one, routing accuracy over routed tickets,
needs-triage rate, no-match recall, and misroute counts by `expected->got`. Urgent
recall is ranked above all of them. A false urgent costs an agent a few minutes; a
missed urgent costs a customer.

## Status

The CLI, shared policy, evaluation workflow, and interactive workbench are
implemented, with unit and browser tests in the repo.

The 1000-ticket dataset has no hand labels yet, so it supports live demonstrations
but does not establish classification accuracy. `DEFAULT_PARAMS` still contains
initial values that need evaluation against labelled tickets.

The Zendesk adapter remains deferred. The team roster has placeholder group IDs,
and this app does not write decisions back to a helpdesk.

## Layout

| Path | What it is |
|---|---|
| `src/triage/questions.ts` | the seven Jev questions and their criteria |
| `src/triage/run.ts` | one request per ticket, zod-validated on the way back |
| `src/triage/policy.ts` | answers to decision; pure, no I/O, every knob lives here |
| `src/config/teams.ts` | the team roster, including each team's `not` line |
| `scripts/eval.ts` | cache, score, sweep |
| `scripts/build_evalset.py` | the only Python file; runs once, writes the CSV |
| `web/components/floor/` | draggable canvas, team piles, controls, and ticket animations |
| `web/components/workbench/` | ticket evidence, compose dialog, and policy controls |
| `web/components/run-store.tsx` | shared live-run state across routes |
| `web/app/api/classify/` | single-ticket, streaming batch, and pause endpoints |
| `web/e2e/` | Playwright browser, accessibility, and responsive-layout checks |

## Checks

Run the core checks from the repository root:

```sh
bun run test
bun run typecheck
```

Run web checks from `web/` after installing its dependencies:

```sh
cd web
bun run test
bun run typecheck
bunx playwright install
bun run test:e2e
```

Playwright builds and starts the production app on port 3100, then runs Chromium,
Firefox, and WebKit tests. Coverage includes ticket details, the compose dialog,
run navigation, API validation, accessibility, and responsive layouts in both themes.

Plain `bun test` at the root sweeps `web/tests` too, so it needs `web`'s dependencies
installed.
