# A ticket opens its own page

Written against: ab9ad87 (working tree dirty; see `git status`)

## Evidence chain

- Surface: the ticket lists on the floor, and `web/components/workbench/detail.tsx`
- Problem: a ticket's evidence is reachable only as an in-page view swap inside
  `Workbench`, driven by `view === "detail"` and a `selected` id in component state. A ticket
  therefore has no address: it cannot be linked, opened in a new tab, bookmarked or shared,
  and the browser back button does not return from it. Every full evidence view the app
  already renders is stranded behind transient state.
- Design evidence: `web/components/workbench/detail.tsx` and the five evidence components it
  composes are complete and correct; `web/app/page.tsx` proves the App Router server-loading
  pattern; `web/lib/fixtures.ts` already reads tickets by id from the eval set.
- Owner: `web/app/` routing and `web/components/workbench/detail.tsx`
- Scope and affected surfaces: new `web/app/tickets/[id]/page.tsx`, new run store,
  `web/components/workbench/workbench.tsx`, the floor's ticket lists
- Uncertainty: answers live in client memory after a live run, so a cold load of
  `/tickets/<id>` has no evidence to show. The decision below resolves this; it does not
  defer it.

## Design decision

Give every ticket a real route at `/tickets/[id]`. The page is a server component that reads
the ticket's subject and body from the eval set by id and returns 404 for an unknown id. Its
evidence is a client island fed by a run store shared with the floor.

Two entry paths, both correct:

- Soft navigation from the floor carries the store, so the evidence renders immediately with
  the latency the run measured.
- A cold load has an empty store, so the island classifies that single ticket through the
  existing `/api/classify` route and renders the result. One ticket, one request.

This is the honest consequence of dropping the cached answer file: evidence exists only for a
run that happened. Rather than hide that, the page states which of the two it is showing.

## Reuse

- `Detail` from `web/components/workbench/detail.tsx` and the five evidence components it
  composes. Render them unchanged; this plan gives them a route, it does not redesign them.
- `loadTickets()` in `web/lib/fixtures.ts` for the server read. Add a `loadTicket(id)`
  beside it rather than filtering the full 1000-row parse in the page.
- The `classify()` fetch helper currently inline in `web/components/workbench/workbench.tsx`.
  Lift it to `web/lib/classify.ts` unchanged so both the floor and the ticket page call one
  implementation.
- `Row`, `RunResult` and `verdictOf` from `web/lib/rows.ts`.
- `Skeleton` from `web/components/ui/skeleton.tsx` for the classifying state.
- Exemplar for a server page handing data to a client component: `web/app/page.tsx`.

New primitive required: `web/components/run-store.tsx`, a client context holding
`Map<string, RunResult>` plus its setter. The existing system keeps run results in
`Workbench`'s local state, which cannot reach a sibling route. The provider mounts in
`web/app/layout.tsx` so both `/` and `/tickets/[id]` read the same map. Consumers: the floor
and the ticket page only.

## Changes

1. `web/lib/classify.ts` (new)
   - Change: move the existing `classify()` helper here verbatim, including the
     `AnswersSchema.parse` on the response and the error message it throws on a non-OK
     status.
   - Preserve: the current parse and error behaviour exactly. A shape change must keep
     throwing rather than scoring as zero.
   - Verify: `grep -rn "api/classify" web/components/` returns only the new import.

2. `web/components/run-store.tsx` (new, client)
   - Change: a provider exposing `{ results, record(id, result) }`. Store results
     immutably: `setResults((prev) => new Map(prev).set(id, result))`, never a mutation of
     the held map, per the repository's immutability rule.
   - Preserve: nothing exists yet.
   - Verify: a run on `/`, then a soft navigation to a ticket, renders evidence with no
     network request.

3. `web/app/layout.tsx`
   - Change: wrap `{children}` in the provider. The layout stays a server component; the
     provider is the client boundary.
   - Preserve: the Inter setup and the metadata block untouched.
   - Verify: both routes read one store.

4. `web/lib/fixtures.ts`
   - Change: add `loadTicket(id: string): Promise<Ticket | null>`.
   - Preserve: `loadTickets()` and the CSV parse.
   - Verify: an unknown id returns `null`, not a throw.

5. `web/app/tickets/[id]/page.tsx` (new, server)
   - Change: await `params`, call `loadTicket(id)`, call `notFound()` when it is null, and
     render the client island with the ticket. Export `generateMetadata` returning the
     ticket's subject as the title, so a shared link reads as the ticket.
   - Preserve: the App Router conventions already used in `web/app/page.tsx`.
   - Verify: `/tickets/does-not-exist` renders the 404, not a crash.

6. `web/components/workbench/ticket-page.tsx` (new, client)
   - Change: read the store. With a hit, render `Detail`. With a miss, call
     `classify(ticket)` once on mount, show `Skeleton` while it is in flight, record the
     result in the store, then render `Detail`. On failure show the route's own error text
     and a retry control; never render an empty evidence view. Label which path produced the
     evidence: the run's measured latency, or a note that this ticket was classified on
     open.
   - Preserve: `Detail`'s layout, its GSAP step reveal and its reduced-motion guard.
   - Verify: a cold load of a ticket id classifies exactly once, including under React strict
     mode's double effect invocation. Guard with a ref, not a disabled lint rule.

7. `web/components/workbench/workbench.tsx`
   - Change: delete the `view === "detail"` branch, the `selected` state and the j/k/Escape
     handler that drove it. Every ticket reference on the floor becomes a `next/link` to
     `/tickets/<id>`. Record each resolved run result into the store as well as local state.
   - Preserve: the compose view and its flow. Compose posts a ticket that is not in the eval
     set, so it keeps its in-page result rather than gaining a route.
   - Verify: back from a ticket returns to the floor with the arrangement and the run intact.

8. `web/e2e/workbench.spec.ts`
   - Change: replace the in-page detail assertions with a navigation assertion: click a
     ticket, assert the URL is `/tickets/<id>` and the evidence is visible, go back, assert
     the floor is visible.
   - Preserve: the run and pool assertions.
   - Verify: `cd web && npx playwright test e2e/workbench.spec.ts` passes.

## Scope

- Inherit: every ticket on the floor and in the ticket sheet.
- Verify: `web/e2e/appearance.spec.ts` snapshots named `detail` were captured against the
  in-page view and now belong to a route. Re-point them at `/tickets/<a known id>` and
  regenerate.
- Exclude: the compose flow, the policy drawer, the classify route's own contract, and
  anything under `src/`.

## Validation

- Product: run the floor, open a ticket, read its evidence, press back, and confirm the run
  is still on screen. Then open the same URL in a new tab and confirm it classifies on open
  and says so.
- Interface: `/tickets/<id>` at 390, 768, 1024, 1440; light, dark and unstamped; the
  classifying, loaded, failed and not-found states; a ticket with an empty subject.
- System: confirm one `classify()` implementation, one store, and that `Detail` was reused
  rather than reimplemented for the route.
- Repository: `cd web && npx tsc --noEmit --pretty false` → no output.
- Repository: `bun test tests/ && cd web && bun test tests/` → all green.

## Stop conditions

- Stop if a cold load would need the whole 1000-ticket run to render one ticket. The page
  classifies one ticket; if that turns into a bulk fetch, the scope has drifted.
- Stop if the store must persist across a hard reload. That is a caching decision, and the
  product has deliberately dropped cached runs.

## Design documentation

- After acceptance and validation: record in the frontend spec that tickets are addressable
  at `/tickets/[id]`, that evidence comes from the session's run or from a single
  classify-on-open, and that no answers are persisted between reloads.
