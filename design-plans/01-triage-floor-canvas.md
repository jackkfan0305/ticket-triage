# The board becomes one pannable, zoomable floor with draggable cards

Written against: ab9ad87 (working tree dirty; see `git status`)

## Evidence chain

- Surface: `web/app/page.tsx` → `web/components/workbench/workbench.tsx`, view `index`
- Problem: the index view is a static table (`web/components/workbench/board.tsx`) inside a
  fixed two-column page. There is no spatial relationship between a ticket and the team that
  receives it, so a live run reads as rows changing text. The approved direction is a canvas
  floor where the inbox and the seven destinations are cards on one surface and each ticket
  visibly travels from the inbox to its team as the model answers.
- Design evidence: `docs/superpowers/specs/2026-09-20-triage-workbench-frontend.md`
  (approved, governs `web/`); token set in `web/app/globals.css`; motion conventions in
  `web/lib/motion.ts`; the published Triage Floor draft at
  https://claude.ai/artifact/GqHxfDFcU8YcaSjwhKY1ju
- Owner: `web/components/workbench/` and `web/app/globals.css`
- Scope and affected surfaces: `web/components/workbench/workbench.tsx`,
  `web/components/workbench/board.tsx` (retired), new `web/components/floor/*`,
  `web/lib/physics.ts`, `web/app/globals.css`
- Uncertainty: none for layout and motion. The classification pipeline is unchanged; this
  plan replaces how a run is displayed, not how it runs.

## Design decision

Replace the index table with a canvas surface. One fixed viewport holds a single transformed
`world` layer; the camera is `{x, y, k}` applied as `translate(x, y) scale(k)` on that layer.
Every box on the floor, the unrouted inbox included, is a card at world coordinates and a
physics body the reader can drag and throw. A ticket that resolves flies from the inbox mouth
along its team's drawn route and lands on that team's card.

Cards must not interact with each other. No separation, no collision, no link springs. Each
body carries only its own momentum, so a card goes exactly where it is thrown and nothing
moves it afterwards. This is a stated product requirement, not a simplification.

Integration is delta-time normalised rather than per-frame, so the feel is identical at 60Hz
and 120Hz. Dragging leads the pointer through a time-corrected lerp, which gives the card
weight without perceptible lag, and release carries the velocity measured over the last frame.

## Reuse

- `decide()` and `urgency()` from `../../src/triage/policy` imported directly. Do not port,
  copy or reimplement the policy; `web/lib/rows.ts` already proves the cross-package import
  works and `verdictOf()` there is the existing wrapper.
- `TEAMS` and `TEAM_IDS` from `../../src/config/teams` for the roster and ownership copy.
- Tokens from `web/app/globals.css`: `--panel`, `--panel-2`, `--line`, `--line-soft`,
  `--ink`, `--ink-2`, `--ink-3`, `--brand`, `--brand-soft`, `--track`,
  `--p-low|normal|high|urgent` and their `-bg` pairs, `--duration-fast`, `--ease-out-expo`.
- `gsap`, `useGSAP`, `prefersReducedMotion` from `web/lib/motion.ts`.
- `pooled()` from `web/lib/pool.ts` for the bounded run; it already exists and is tested.
- `PriorityChip` and `PRIORITY_STRIPE` from `web/components/workbench/priority.tsx`.
- Exemplar for a GSAP-driven client component with reduced-motion guard:
  `web/components/workbench/counter.tsx`.

New primitives required, with justification:

- `web/lib/physics.ts` — the existing system has no motion model, only presentational
  tweens. Bodies, integration and the camera transform are pure functions with no DOM
  access, which keeps them unit-testable in `web/tests/` alongside `pool.ts` and
  `latency.ts`. Consumers: the floor components only.
- Three new tokens in `globals.css` for the floor itself, which no existing token expresses:
  `--floor` (the canvas ground, one step off `--ground`), `--floor-dot` (grid dot), and
  `--route` (the dashed link). Define all three in the bare `:root` light block first, then
  in the `prefers-color-scheme: dark` block guarded as
  `:root:not([data-theme="light"])`, then in `:root[data-theme="dark"]`, matching the
  existing three-block pattern in that file exactly.

## Changes

1. `web/lib/physics.ts` (new)
   - Change: export `type Body = { id: string; x: number; y: number; px: number; py: number;
     w: number; h: number; vx: number; vy: number; home: { x: number; y: number } }` and the
     pure step functions below. No DOM, no GSAP, no React.
     - `FRICTION = 0.94` per 16.667ms, `MAX_V = 70`, `BOUNCE = 0.3`, `LEAD = 0.45`.
     - `decay(v, dt)` returns `v * Math.pow(FRICTION, dt / 16.667)`.
     - `lead(current, target, dt)` returns
       `current + (target - current) * (1 - Math.pow(1 - LEAD, dt / 16.667))`.
     - `integrate(body, dt, bounds)` advances a free body: clamp velocity to `MAX_V`,
       `x += vx * dt / 16.667`, decay both components, zero anything under `0.01`, then
       clamp inside `bounds` reflecting velocity at `BOUNCE`.
     - `tilt(vx)` returns `clamp(vx * 0.35, -6, 6)` in degrees.
     - `fit(bodies, viewport, padding)` returns `{ x, y, k }` framing the bodies' bounding
       box, clamped to `MIN_K = 0.18` / `MAX_K = 2.4`.
     - `zoomAt(view, px, py, factor)` returns a new view keeping the point under the cursor
       fixed. Return new objects; never mutate the argument (repo rule: immutability).
   - Preserve: nothing exists here yet.
   - Verify: `web/tests/physics.test.ts` covers decay reaching zero, `integrate` bouncing off
     a bound, `zoomAt` holding its anchor, and `fit` framing a two-body spread.

2. `web/components/floor/floor.tsx` (new, client)
   - Change: owns the viewport, the world layer, the camera state and the pointer model.
     - Wheel zooms about the cursor with `Math.exp(-deltaY * 0.0016)`; the listener is
       registered with `{ passive: false }` and calls `preventDefault`.
     - One pointer on the background pans; one pointer on a card drags it; two pointers
       pinch-zoom about their midpoint.
     - A `pointerup` whose travel from `pointerdown` is under 5px is a click, not a throw.
     - Arrow keys pan, `+`/`-` zoom about centre, `0` fits. The viewport carries
       `tabIndex={0}` and an `aria-label` naming every one of those interactions.
     - One `gsap.ticker` callback owns the frame: read `gsap.ticker.deltaRatio() * 16.667`
       as `dt`, `lead()` the held body toward its pointer target, `integrate()` every other
       body, then write positions with `gsap.set(el, { x, y, rotation: tilt(vx) })`. Skip the
       DOM write and the route redraw on frames where nothing moved.
     - `prefersReducedMotion()` from `web/lib/motion.ts` disables tilt and the ticket flight;
       pan and zoom stay, since they are reader-driven.
   - Preserve: the existing run model. Keep `POOL_SIZE`, `pooled()`, per-ticket latency, the
     `runError` summary and the API contract in `web/app/api/classify/route.ts` untouched.
   - Verify: dragging a card onto another leaves the second card's transform unchanged.

3. `web/components/floor/card.tsx` (new, client)
   - Change: one presentational card used by both the inbox and the team nodes. Absolute
     position, `left: 0; top: 0`, moved only by the GSAP transform the ticker writes.
     Team nodes show name, count, ownership line from `TEAMS[id].owns`, a four-segment
     priority mix bar, and the most recent arrivals. The `none` node is visually a holding
     pen, not a team: dashed border, hatched ground, no shadow.
   - Preserve: `PriorityChip` and the `--p-*` colour semantics; a priority keeps the same
     hue everywhere it appears.
   - Verify: at 1440px the seven team cards and the inbox sit without overlap at the default
     arrangement, and `Tidy` returns every card to its `home`.

4. `web/components/floor/routes.tsx` (new, client)
   - Change: one SVG sized to the physics bounds holding one `path` per team. Each route is a
     cubic bezier from the inbox's facing edge to the team's facing edge with both control
     points at the horizontal midpoint. Recompute `d` from live body positions on frames
     where a body moved, so a dragged card takes its wiring with it.
   - Preserve: the dashed, low-contrast treatment; routes are wiring, never content.
   - Verify: dragging a team card left of the inbox flips which edges the route connects.

5. `web/components/floor/flight.tsx` (new, client)
   - Change: on each resolved ticket, animate a proxy `{ t: 0 → 1 }` and sample the same
     bezier the route uses, so a flight tracks cards that move mid-flight. Put translation on
     the outer element and scale/opacity on an inner element so two tweens never write the
     same transform. Cap concurrent flights at 10; over the cap, land instantly. Duration
     scales as `1.15 / Math.sqrt(speed)`.
   - Preserve: one flight per resolved ticket, landing on the card that owns the verdict.
   - Verify: with reduced motion, counts still increment and no flyer is created.

6. `web/components/workbench/workbench.tsx`
   - Change: render `Floor` in place of `Board` for the index view. Keep the compose and
     detail views, the policy drawer, the filter state and every existing keyboard shortcut.
     A ticket resolves into the same `Row` shape it uses today.
   - Preserve: `visibleRows`, `matchesFilter`, `runLive`, `submitCompose`, the pool bound and
     the latency summary. This plan changes presentation only.
   - Verify: `bun test tests/` and `bun test web/tests/` stay green; a live run still fills
     every row with its own latency.

7. `web/components/workbench/board.tsx`
   - Change: delete once nothing imports it.
   - Preserve: nothing; the floor supersedes it.
   - Verify: `grep -rn "workbench/board" web/` returns no hits.

8. Text selection while dragging (spans `floor.tsx`, `card.tsx`, `globals.css`)
   - Change: dragging a card currently sweeps a text selection across every label it passes,
     which flashes highlight over the whole floor. Fix it at the source rather than by
     clearing the selection afterwards:
     - `.card`, the world layer and the HUD panels get the `.no-select` utility. The ticket
       sheet, the evidence view and the ticket page must **not** get it; their text stays
       selectable, which is the point of the exclusion.
     - The card's `pointerdown` handler calls `event.preventDefault()` before capturing the
       pointer, which stops the browser starting a selection drag. Do not call it when the
       event target is inside a `button`, `input` or `a`, or those controls stop working.
     - The viewport and every card carry `touch-action: none` so a touch drag pans or moves
       instead of scrolling and selecting.
   - Preserve: selectable ticket text everywhere a reader would want to copy it.
   - Verify: drag a team card across the full width of the floor at 1440px and confirm no
     text anywhere renders with a selection background. Then select a subject in the ticket
     sheet and confirm it still highlights and copies.

9. `web/app/globals.css`
   - Change: add `--floor`, `--floor-dot` and `--route` to each of the three theme blocks
     described under Reuse, and expose them through `@theme inline` as `--color-floor`,
     `--color-floor-dot` and `--color-route` beside the existing `--color-*` mappings.
     Add a `.no-select` utility in the existing `@layer utilities` block setting
     `user-select: none` and `-webkit-user-select: none`.
   - Preserve: every existing token value, the `@custom-variant dark` block, and the rule
     that light is the base definition with no colour defined only inside a media query.
   - Verify: `bun test web/tests/contrast.test.ts` still passes; the three new tokens resolve
     in light, dark, and the unstamped system default.

## Scope

- Inherit: the index view at `/`, and any future surface that renders the floor.
- Verify: `web/e2e/appearance.spec.ts` snapshots for `index` at 320, 768, 1024 and 1440 in
  both themes will all change. Regenerate them deliberately and review each one; do not
  blanket-update. `web/e2e/workbench.spec.ts` asserts table rows and needs rewriting against
  the floor.
- Exclude: the detail view, the compose view, the policy drawer, the classify route, the
  evaluation scripts, and anything under `src/`.

## Validation

- Product: press Start, watch tickets leave the inbox and land on teams, and confirm the
  counts on each card match the number of rows that team holds.
- Interface: `/` at 390, 768, 1024, 1440 and 1920, in light, dark and the unstamped system
  default; with reduced motion on; at 18%, 100% and 240% zoom; with a card thrown against
  each of the four bounds.
- System: confirm the floor consumes existing tokens and `decide()` rather than introducing a
  parallel palette or a second copy of the policy. Confirm `web/lib/physics.ts` holds no DOM
  access.
- Repository: `cd web && npx tsc --noEmit --pretty false` → no output.
  `bun test tests/ && cd web && bun test tests/` → all green.
- Repository: `grep -rn "user-select" web/app/globals.css web/components/floor/` → the
  draggable surface opts out of selection.

## Stop conditions

- Stop if importing `../../src/triage/policy` from a client component under the new directory
  fails to compile; that is an integration problem the spec reserves a Bun workspace for, and
  it must be solved before any floor code is written on top of it.
- Stop if the physics must know about more than one body at a time. Cards are independent by
  requirement; any force that reads a second body means the scope has drifted.

## Design documentation

- After acceptance and validation: record in
  `docs/superpowers/specs/2026-09-20-triage-workbench-frontend.md` that the index view is a
  canvas floor rather than a table, that cards are independent bodies with no inter-card
  forces, and that the three floor tokens exist. Supersede the table description in place;
  do not append a second description of the same surface.
