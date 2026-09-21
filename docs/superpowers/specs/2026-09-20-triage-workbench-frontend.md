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

Every ticket on one floor.

- Chrome floats over the floor as rounded panels rather than sitting above it in a header
  row, which on a full-bleed canvas would steal the height the floor needs. `.hud` pins a
  panel to a viewport corner and carries the safe-area inset itself.
- Top left: the title, and nothing but the title. `<h1>` reads **Ticket Triage**. The model
  chip and the run-state chip are gone: run state has two honest homes already, the
  Start/Pause/Resume/Done label on the primary button and the `<n> routed · <n> waiting`
  readout beside it, and the model identifier belongs with the statistics it qualifies.
- Top right: the readout, a playback-speed cycle, the primary run button, Reset, Write your
  own ticket, a developer-mode toggle and a theme toggle. Normal and developer mode are one
  icon button carrying `aria-pressed`, matching the theme button beside it.
- Bottom right: zoom out, the live percentage, zoom in, frame everything, tidy.
- Bottom left: the hint in normal mode, the developer panel in developer mode. The developer
  panel owns the latency statistics, the model identifier, the policy thresholds and
  `Reset params`, which sits beside the thresholds it resets.
- Pause holds the pool at the next ticket rather than cancelling anything already with the
  model, so every latency the run reports is a real one. Reset resets the run and nothing
  else: the arrangement of the floor belongs to the reader, and Tidy is the only thing that
  puts it back.
- Filtering moved onto the ticket sheet, beside the search field, where the tickets it
  filters are.
- Inter stays the only family, at the four weights `layout.tsx` loads. The published draft
  used IBM Plex; that was a draft-only choice. Figures rely on the `.num` utility and the
  `font-variant-numeric: tabular-nums` already set on `body`.
- Floor: a canvas, not a table. One fixed viewport holds a transformed world layer, and the
  camera is `{x, y, k}` applied to it. The unrouted inbox and the seven destinations (six
  teams plus a `none` holding pen) are cards at world coordinates, wired to the inbox by
  dashed bezier routes. A ticket that resolves flies along its team's route and lands on that
  card; the count ticks on landing, not on the answer arriving. Drag the background to pan, a
  card to move it, scroll or pinch to zoom; arrow keys pan, `+`/`-` zoom, `0` frames
  everything, Tidy returns every card to its home.
- **Cards exert no force on each other.** No separation, no collision, no link springs. Each
  card is an independent body carrying only its own momentum, so it goes exactly where it is
  thrown and nothing moves it afterwards. The floor's edge is the only wall. The model lives
  in `web/lib/physics.ts` as pure functions; nothing there reads a second body.
- Dragging never sweeps a text selection. The `.no-select` utility covers the world layer and
  the cards, `pointerdown` calls `preventDefault()` away from controls, and both the viewport
  and every card set `touch-action: none`. The ticket sheet and the evidence view are
  excluded: their text stays selectable.
- A card's lists are a display of its pile. The world layer carries the camera's scale, so a
  control inside it shrinks below the 24px target floor; tickets are opened from the ticket
  sheet, which sits outside that transform.
- Three tokens belong to the floor and nothing else: `--floor`, `--floor-dot` and `--route`.

**No accuracy metrics.** `evalset.csv` has zero labelled rows, so exact match, urgent recall
and routing accuracy cannot be computed from anything real. Do not add them, and do not
score against `src_priority` or `src_queue`: that data is 3-level with no `urgent` at all,
and its 10 queue categories do not map onto the six teams. They return once a human labels
the set.

### Ticket

One ticket, in depth, at its own address: `/tickets/[id]`. Every ticket reference on the
floor is a link to it, so a ticket can be opened in a tab, bookmarked, shared, and returned
from with the browser's back button.

The page is a server component that reads the ticket's subject and body from the eval set by
id and 404s on an unknown one. Its evidence is a client island fed by a run store that the
floor shares. Two entry paths, and the page says which one it took:

- A soft navigation from the floor arrives with the run's own answer already in the store, so
  the evidence renders with the latency the run measured.
- A cold load has an empty store, because no answers are persisted between reloads, so the
  island classifies that one ticket through `/api/classify`. One ticket, one request, guarded
  by a ref so strict mode's second effect pass does not send a second.

The verdict is read under the default policy. The thresholds on the floor are that page's own
state and do not reach across a route.

A ticket the reader wrote is not in the eval set, so nothing could load it back; the compose
view keeps its result in place rather than gaining a route.

The run store also seeds the floor on mount, and the floor's bodies and camera live outside
component state, so coming back from a ticket finds the run and the arrangement intact.

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
