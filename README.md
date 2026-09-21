# ticket-triage

Turns a support ticket into a priority and an owning team. It asks TypeSafe's Jev
model seven narrow questions about the ticket text, then applies a policy written in
plain TypeScript to reach a decision.

The split matters: Jev judges, code decides. Every weight and threshold lives in one
pure function with no I/O, so the same policy runs in the CLI, in the eval harness,
and in the browser, and tuning it costs nothing.

## Setup

Needs [Bun](https://bun.sh) 1.3+.

```sh
bun install
echo 'TYPESAFE_API_KEY=sk-...' > .env   # gitignored; the web app reads this same file
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

A Next.js floor of ticket cards from the eval set. Pick how many are on it (50 to
1000), start a run, and watch each card fly to its pile as Jev answers. Opening a
card shows the gates, the score levels, and the urgency arithmetic that produced its
priority, with the thresholds live: drag one and every card re-decides in the browser.
That works because `web/lib/rows.ts` imports the same `decide()` the CLI calls.

The key is read from the repo-root `.env`, one level above `web/`, so it is set once
for both. Runs go through a server route; the key never reaches the browser.
`TRIAGE_CONCURRENCY` overrides how many tickets are in flight at once (default 8).

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
bun run eval --refresh    # ask Jev for each ticket, cache the answers, then score
bun run eval              # score from the cache
bun run eval --sweep      # walk thresholds over the cache, no network
```

`tests/fixtures/evalset.csv` holds 1000 English tickets drawn uniformly from
[Tobi-Bueck/customer-support-tickets](https://huggingface.co/datasets/Tobi-Bueck/customer-support-tickets),
so the mix is the one the dataset actually has. That leaves 27 Human Resources
tickets in the set, which sit outside the roster and are the only way to check that
the no-match branch ever fires. Rebuild with
`uv run --with datasets scripts/build_evalset.py`. It refuses to run if the CSV
already holds hand labels, since those are the one thing it cannot regenerate; move
the file aside to force a rebuild.

The dataset's own `priority` and `queue` are sampling strata, never ground truth.
Ground truth is the `expected_priority` and `expected_team` columns, filled in by hand
against this roster.

The answer cache (`tests/fixtures/answers.json`) is not in the repo, so the first run
needs `--refresh`. Entries are keyed by ticket id and fingerprinted by model, question
set, and ticket text; change any of those and the entry goes stale rather than quietly
scoring against answers to a different question.

Reported metrics: priority exact and within-one, routing accuracy over routed tickets,
needs-triage rate, no-match recall, and misroute counts by `expected->got`. Urgent
recall is ranked above all of them. A false urgent costs an agent a few minutes; a
missed urgent costs a customer.

## Status

The CLI, the policy, the eval harness, and the workbench are built and tested. Two
things are open, and they are the same thing twice:

- **The eval set is unlabelled.** `expected_priority` and `expected_team` are empty,
  so `bun run eval` has nothing to score against yet.
- **Every number in `DEFAULT_PARAMS` is still a starting guess.** They are placeholders
  waiting on the sweep, which needs the labels. Treat any of them found unchanged after
  tuning as a bug, not as a value someone chose.

Deferred by design, with the research written down in Section 6 of the spec: the
Zendesk adapter. `Priority` already uses Zendesk's four values, so the write-back is a
field copy rather than a mapping table.

## Layout

| Path | What it is |
|---|---|
| `src/triage/questions.ts` | the seven Jev questions and their criteria |
| `src/triage/run.ts` | one request per ticket, zod-validated on the way back |
| `src/triage/policy.ts` | answers to decision; pure, no I/O, every knob lives here |
| `src/config/teams.ts` | the team roster, including each team's `not` line |
| `scripts/eval.ts` | cache, score, sweep |
| `scripts/build_evalset.py` | the only Python file; runs once, writes the CSV |
| `web/` | the workbench; imports `policy.ts` across the package boundary |
| `docs/superpowers/specs/` | the design spec and the frontend spec, with the arguments |

```sh
bun test ./tests/   # 42 tests, no network
bun run typecheck
cd web && bun test tests/ && bun run test:e2e
```

Plain `bun test` at the root sweeps `web/tests` too, so it needs `web`'s dependencies
installed.
