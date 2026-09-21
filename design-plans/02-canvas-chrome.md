# Chrome floats over the floor and the title is only the project name

Written against: ab9ad87 (working tree dirty; see `git status`)

## Evidence chain

- Surface: `web/components/workbench/workbench.tsx`, the `<header>` block
- Problem: the header is a page-level bar that consumes vertical space above the board and
  crowds the title with three competing labels. `<h1>` reads "Triage Workbench" and is
  immediately followed by a model chip and a run-state chip, so the strongest typographic
  slot on the page carries build detail rather than the product's name. Once the index view
  becomes a full-bleed canvas (plan 01), a fixed header row also steals height the floor
  needs.
- Design evidence: the `.cap`, `.num` and `.gutter` utilities and the full token set in
  `web/app/globals.css`; Inter loaded with four weights and exposed as `--font-inter` in
  `web/app/layout.tsx`; `docs/superpowers/specs/2026-09-20-triage-workbench-frontend.md`.
- Owner: `web/components/workbench/workbench.tsx` and `web/app/globals.css`
- Scope and affected surfaces: the header of the index, detail and compose views
- Uncertainty: none.

## Design decision

Lift the controls off the page and float them over the floor as rounded panels: the title
top-left, the run cluster top-right, a hint bottom-left, zoom bottom-right, and the developer
statistics as a bottom-left panel that replaces the hint when developer mode is on.

The title panel says `Ticket Triage` and nothing else. Run state already has two honest
homes: the Start/Pause/Resume/Done label on the primary button, and the
`<n> routed · <n> waiting` readout beside it. The model identifier belongs with the
statistics it qualifies, so it moves into the developer panel. Deleting both chips leaves the
product name alone in the one slot that should carry it.

Normal and developer mode collapse from a two-item toggle group into a single icon button
carrying `aria-pressed`, matching the theme button beside it.

## Reuse

- Typeface: `--font-inter` from `web/app/layout.tsx`, surfaced as `--font-sans` in the
  `@theme inline` block of `web/app/globals.css`. **Do not introduce a second family.** The
  published draft used IBM Plex; that was a draft-only choice and does not carry over. Data
  and numerals use the existing `.num` utility and the `font-variant-numeric: tabular-nums`
  already set on `body`, which is how this app already distinguishes figures without a mono
  face.
- `Button` from `web/components/ui/button.tsx` for every control.
- The `.cap` utility for the uppercase panel headings in the developer panel.
- Tokens `--panel`, `--line`, `--ink`, `--ink-2`, `--ink-3`, `--brand`, `--brand-ink`,
  `--panel-2`, `--track`, `--duration-fast`.
- `lucide-react`, already a dependency, for every icon. Do not inline SVG paths by hand.
- Exemplar for an existing floating panel with the app's border, radius and padding rhythm:
  `web/components/workbench/policy-drawer.tsx`.

New primitive required: a `.hud` positioning utility in the `@layer utilities` block of
`globals.css`, because the existing `.gutter` utility centres a max-width column and cannot
express a panel pinned to a viewport corner. Corner offsets must add
`env(safe-area-inset-top, 0px)` and `env(safe-area-inset-bottom, 0px)` to their own padding.
Consumers: the floor chrome only.

## Changes

1. `web/components/floor/hud.tsx` (new, client)
   - Change: render four fixed panels over the viewport.
     - Top-left: `<h1>Ticket Triage</h1>`, a status dot, nothing else.
     - Top-right: the routed/waiting readout, a speed cycle button, the primary
       Start/Pause/Resume button whose icon swaps between `Play` and `Pause`, a Reset icon
       button, a developer-mode icon toggle with `aria-pressed`, and a theme icon button.
     - Bottom-right: zoom out, live percentage, zoom in, frame-everything, and tidy.
     - Bottom-left: the hint in normal mode, the developer panel in developer mode.
   - Preserve: every existing control's behaviour. Reset resets the run only; the card
     arrangement belongs to the reader and Tidy is the only thing that restores it.
   - Verify: at 1440px no panel overlaps another; at 430px the clusters wrap and the page
     still has no horizontal scroll.

2. `web/components/workbench/workbench.tsx`
   - Change: delete the `<header>` block and the `ToggleGroup` filter row it owns; render
     `Hud` instead. Replace the `view === "index" | "detail" | "compose"` header controls
     with the cluster above. Keep the `view` state itself.
   - Preserve: `runLive`, `setParams`, the `Reset params` action (move it into the developer
     panel beside the thresholds it resets), and the compose entry point.
   - Verify: `bun test web/tests/` stays green.

3. `web/components/workbench/latency-rail.tsx`
   - Change: move its content into the developer panel. It keeps owning p50, p95, mean, wall
     and the per-ticket bars. Add the model identifier here, labelled, since this is the
     panel its numbers belong to.
   - Preserve: `summarise()` from `web/lib/latency.ts` and the `Counter` tween. Both are
     tested and correct.
   - Verify: `bun test web/tests/latency.test.ts` passes untouched.

4. `web/app/globals.css`
   - Change: add `.hud` to `@layer utilities` with the corner variants and safe-area
     handling described under Reuse.
   - Preserve: `.gutter`, `.num`, `.cap` and every token.
   - Verify: the title panel clears the notch on a phone viewport with
     `viewport-fit=cover`.

5. `web/app/layout.tsx`
   - Change: none to the font. Confirm only that `Inter` still loads weights 300 to 600 with
     `display: "swap"` and that `--font-inter` reaches `--font-sans`.
   - Preserve: the whole file.
   - Verify: `document.body` computes to Inter, not a fallback and not IBM Plex.

## Scope

- Inherit: every view rendered inside `Workbench`.
- Verify: `web/e2e/appearance.spec.ts` header snapshots at all four widths in both themes.
  `web/e2e/workbench.spec.ts` asserts on the "cached run" / "not run yet" chip text, which
  this plan deletes; rewrite those assertions against the run button label.
- Exclude: the evidence components, the policy maths, the classify route.

## Validation

- Product: start a run and confirm its state is legible from the button and the readout
  alone, with no chip.
- Interface: `/` at 390, 768, 1024, 1440; light, dark and unstamped; developer mode on and
  off; the longest run-state label (`Resume`) and the longest readout
  (`1000 routed · 0 waiting`).
- System: confirm no second typeface is loaded and that every control is the shared
  `Button`, not a bespoke element.
- Repository: `grep -rniE "plex|space grotesk|font-mono" web/app web/components` → no hits.
- Repository: `cd web && npx tsc --noEmit --pretty false` → no output.

## Stop conditions

- Stop if removing the run-state chip leaves any run state unreadable from the remaining
  controls; the chip is redundant, not decorative, and that must stay true.

## Design documentation

- After acceptance and validation: record in the frontend spec that the product name stands
  alone in the title, that run state lives on the primary button and the readout, and that
  Inter remains the single family.
