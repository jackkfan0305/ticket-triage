# Triage Workbench Frontend

Date: 2026-09-20
Status: approved for implementation
Supersedes: Section 7 of `2026-09-18-ticket-triage-design.md` ("Deferred frontend visualization")

## What this is

A web frontend for the existing ticket-triage classifier. The classifier is built and
green (41 tests, clean typecheck). Nothing in `src/` gets rebuilt. This document covers
only the new code under `web/`.

A clickable mockup of the settled design ships beside this file as
`2026-09-20-triage-workbench-mockup.html`. Open it before writing code. It is a
single-file prototype, not the target architecture, but its layout, palette, copy and
interaction model are approved and should be reproduced.

## What already exists

| Path | Role | Browser-safe |
|---|---|---|
| `src/types.ts` | `Ticket`, `TriageDecision`, `Answers`, zod schemas | yes |
| `src/config/teams.ts` | six-team roster | yes |
| `src/triage/questions.ts` | the seven Jev questions | yes |
| `src/triage/policy.ts` | `decide(answers, params)`, pure, no I/O | yes |
| `src/triage/run.ts` | `askJev`, uses `TypeSafeClient` | **server only** |
| `tests/fixtures/evalset.csv` | 60 tickets | data |
| `tests/fixtures/answers.json` | 60 cached Jev answers, model `jev-1.13.0` | data |

`policy.ts`, `questions.ts`, `teams.ts` and `types.ts` are pure TypeScript with no Bun or
Node APIs. Import them into client components by relative path. Do not copy, port or
reimplement them. Dragging a threshold must re-run the real `decide()` in the browser over
already-fetched answers, with zero network.

This is the constraint the original spec reserved: keep `evidence` complete and keep
`policy.ts` pure so the browser can re-run the policy.

## Stack

Next.js App Router in `web/`, its own `package.json`. shadcn/ui for components. `@gsap/react`
with `useGSAP` for motion. TypeScript throughout.

**Integration risk, prove this first.** `web/` is a separate package, so Next importing
`../src/triage/policy.ts` crosses a package boundary. Verify a client component can import
and call `decide()` before building anything on top. Fall back to a Bun workspace if it
fights. Do not work around it by copying the file.

## Data flow

**Server route** `web/app/api/classify/route.ts`, POST only. Validates `{ subject, body }`
with zod: subject ≤ 200 chars, body ≤ 5000 chars, body non-empty after trim. Calls `askJev`.
Returns `{ model, answers, latencyMs }`.

Measure latency around the `askJev` call itself with `performance.now()`, so the number is
model time rather than the browser's round trip to localhost. Nothing records latency today;
this route is where it starts existing.

The API key is read server-side only. Never `NEXT_PUBLIC_`. No rate limiting now (local dev),
but this route is the single choke point where it drops in before deploy. Leave it clean.

**Client run model.** The page boots from `answers.json`, labelled as a prior cached run with
its model. A "Run live" control fires one POST per ticket through a bounded concurrency pool,
default 8 in flight. Each response lands independently so rows resolve one at a time with
their own latency.

The bound is not optional. Firing 60 at once makes the API queue them and every reported
latency becomes mostly queue wait, which misrepresents the thing the page exists to show.
Record wall clock, p50 and p95 across the run alongside per-ticket numbers.

Keep both runs in memory. Cached versus live on the same 60 tickets shows how stable the
model is across passes.

## Views

Three, one at a time. Switch with the `hidden` attribute.

**Do not write a CSS rule that sets `display` on the view containers.** That overrides the
browser's `[hidden] { display: none }` and renders all three stacked while the state is
correct. This bug already happened once in the mockup.

### Index

Every ticket on one page.

- Policy drawer, collapsed, at the top. Open from any view. Its closed row summarises the
  current thresholds and floor.
- Latency rail. This is the **only** page-level statistic. Collapses to a single line when
  no live run has happened.
- Toolbar: ticket count, filter chips (all / urgent / high / normal / low / needs-triage),
  and a "Write your own ticket" button.
- Board: a real table. Columns are Ticket (id over subject), Priority, Team, Urgency, Latency.
  Full width, so subjects do not truncate to two lines. Rows are buttons. A 3px priority
  stripe runs down the leading edge.

**No accuracy metrics.** `evalset.csv` has zero labelled rows, so exact match, urgent recall
and routing accuracy cannot be computed from anything real. Do not add them, and do not
score against `src_priority` or `src_queue`: that data is 3-level with no `urgent` at all,
and its 10 queue categories do not map onto the six teams. They return once a human labels
the set.

### Detail

One ticket, in depth. Reached by clicking a board row.

- Bar: boxed "← All tickets", the ticket id, boxed "↑ Previous" / "↓ Next" stepping the
  filtered set. `j`/`k`, arrow keys and Escape work from the keyboard. No rule under the bar.
- Ticket subject and body. No id chip (the bar has it), no source-dataset line.
- Five per-ticket stats: Latency, Priority (naming the gate when one forced it), Nearest edge
  (distance to the closest band boundary, `n/a` when a gate bypassed urgency), Team margin
  (confidence minus floor, signed), Least certain (the weakest of the judgments).
- Evidence, in the order `decide()` evaluates it:
  1. **Gates.** Three noul bars with a tick marking the threshold, so you can see how near a
     ticket came to tripping.
  2. **Scored judgments.** Level strips where bar height is the model's probability for that
     level, chosen level ringed, criteria text from `questions.ts` printed underneath.
  3. **Urgency.** The live arithmetic (`0.60 × 3/4 + 0.30 × 2/3 + 0.10 × 0/3 = 0.6500`) above
     a band ruler with a needle at the computed value. Bands move as thresholds change.
  4. **Team routing.** Probability bars for all seven options with the confidence floor marked.
  5. **Decision.** Priority, team, and tags.

**Tag filtering:** hide `jev-triaged` (on every ticket) and `jev-p-*` (repeats the priority
shown directly above). Render no tag row when nothing survives.

**Bar fills must be `display: block`.** A `<span>` fill inside a non-flex parent stays inline,
and inline elements ignore `width`. This silently broke the team probability bars in the mockup.

### Compose

Subject and body inputs with the same length caps the route enforces, counters, three sample
tickets to start from, and a Classify action. The result joins the board as an ad-hoc ticket
with full evidence, marked "yours".

## Design

**Type.** Inter only, loaded from Google Fonts at weights 300/400/500/600. Body weight 300.
`font-variant-numeric: tabular-nums` on `body`, since there is no mono face and data columns
must still align. Nothing below 11px.

**Color.** Tokens on `:root` for light, redefined under `@media (prefers-color-scheme: dark)`
guarded as `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`.
Never define a color only inside a media or `[data-theme]` block.

Ground is a neutral dark grey, `oklch(20% 0.004 265)`. The four priority bands are the only
saturated family on the page: steel / teal / amber / vermilion. One indigo accent for
interactive chrome. Color carries meaning, not decoration.

**Contrast is a hard floor.** Every text token must clear 4.5:1 against every surface it
renders on, in both themes, measured rather than eyeballed. The mockup's values clear it:
worst case 5.31 dark, 5.11 light. Verify with real OKLCH-to-linear-sRGB math; `getComputedStyle`
returns `oklch()` strings that naive RGB parsing and canvas both silently mis-convert to
garbage. This cost two wrong measurement passes already.

**Surfaces.** No container boxes. Space and hairline rules carry hierarchy. Controls keep a
border or fill so they read as controls; containers do not.

**Gutters.** The user wants a lot of negative space. `padding-inline: clamp(24px, 10vw, 180px)`
on the page wrapper with `max-width: 1400px`. At 1280 that is 128px each side.

## Motion

GSAP, guarded by `prefers-reduced-motion` in both CSS and JS. Compositor-friendly properties
only: `transform`, `opacity`, `clip-path`. Never animate width, height, top, left, margin,
padding or font-size.

Worth animating: metric and stat counters as thresholds move, bar widths settling, rows
resolving one at a time during a live run, view transitions between index and detail,
the urgency needle tracking its value.

Every animated state change also leaves a static cue behind (color, label, icon), so nothing
depends on the animation having run.

## Accessibility

These are not suggestions; each one is a defect caught in review of the mockup.

- One `<main>` landmark.
- Heading levels descend without skipping. No H2 followed by H5.
- No `role="listbox"` wrapped around `<button>` children. Native buttons already carry role,
  name and keyboard support. Prefer deleting ARIA over adding it.
- `aria-current="true"` on the current item only; omit it elsewhere rather than setting `"false"`.
- Every interactive target at least 24×24 CSS px. Watch `summary` elements and restyled range
  thumbs, which lose the user-agent exception once you restyle them.
- `:focus-visible` with a 2px indicator. Never `outline: none` without a verified replacement.
- Name every control.

## Testing

Per `~/.claude/rules/ecc/web/testing.md`:

- Visual regression at 320, 768, 1024, 1440, both themes.
- Automated accessibility audit, keyboard walk, reduced-motion check.
- Unit tests for the concurrency pool and the latency aggregation.
- One Playwright E2E: load the index, open a ticket, drag a threshold, assert the decision changed.

**Responsive is unverified in the mockup.** The headless viewport stayed pinned at 1280 across
every attempt with two different tools, so no width other than 1280 has ever been seen. Treat
320 and 768 as unknown territory and test them properly.

## Out of scope

Zendesk integration, queueing, reply drafting, auth, rate limiting, and any accuracy metric
until the eval set is labelled.
