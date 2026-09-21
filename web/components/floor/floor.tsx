"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { PolicyParams } from "../../../src/triage/policy";
import type { FilterKey } from "@/lib/labels";
import { gsap, prefersReducedMotion } from "@/lib/motion";
import {
  FRAME_MS,
  MAX_V,
  clamp,
  fit,
  integrate,
  lead,
  tilt,
  zoomAt,
  type Body,
  type View,
} from "@/lib/physics";
import { answersOf, verdictOf, type Row, type Verdict } from "@/lib/rows";
import { InboxCard, TeamCard, type Arrival } from "./card";
import { Flyers, MAX_FLIGHTS, launchFlight } from "./flight";
import { FLOOR_BOUNDS, HOME, INBOX_ID, NODE_IDS, bucketOf, nodeName } from "./layout";
import { Routes, drawRoutes, routeCurve } from "./routes";
import { Sheet, type SheetEntry } from "./sheet";

/** The dot grid belongs to the floor, so it scales and travels with the camera. */
const GRID = 26;
/** Room the floating chrome needs; framing ignores it and the panels cover cards. */
const FRAME_PADDING = { x: 34, top: 100, bottom: 110 };
/** A press that never travelled this far is a click, not a throw. */
const CLICK_SLOP = 5;
const KEY_PAN = 70;

/** What the floating chrome drives. The camera belongs to the floor; the
 *  buttons that move it live in the HUD, so it hands out this handle. */
export type FloorHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  frame: () => void;
  tidy: () => void;
};

type FloorProps = {
  ref?: React.Ref<FloorHandle>;
  /** the live zoom, reported for the HUD's readout */
  onZoom?: (percent: number) => void;
  rows: readonly Row[];
  params: PolicyParams;
  filter: FilterKey;
  onFilter: (filter: FilterKey) => void;
  poolSize: number;
};

const makeBodies = (): Body[] =>
  [INBOX_ID, ...NODE_IDS].map((id) => {
    const box = HOME[id] ?? { x: 0, y: 0, w: 200, h: 200 };
    return {
      id,
      x: box.x,
      y: box.y,
      px: box.x,
      py: box.y,
      w: box.w,
      h: box.h,
      vx: 0,
      vy: 0,
      home: { x: box.x, y: box.y },
    };
  });

/**
 * The arrangement and the camera belong to the reader, and opening a ticket is
 * still the same session, so both outlive the unmount a route change causes.
 * One floor exists at a time, so one holder is all there is to share.
 */
const FLOOR: { bodies: Body[]; view: View | null; userMoved: boolean } = {
  bodies: makeBodies(),
  view: null,
  userMoved: false,
};

export function Floor({ ref, onZoom, rows, params, filter, onFilter, poolSize }: FloorProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const routes = useRef<SVGSVGElement>(null);
  const flyers = useRef<HTMLDivElement>(null);

  const elements = useRef(new Map<string, HTMLElement>());
  const view = useRef<View>(FLOOR.view ?? { x: 0, y: 0, k: 1 });
  const held = useRef<{ id: string; tx: number; ty: number } | null>(null);
  const homing = useRef(new Set<string>());
  const dragged = useRef(false);
  const reduced = useRef(false);
  const inFlight = useRef(0);
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;

  // answers already in hand on mount belong where they are; only a new one flies
  const [landed, setLanded] = useState<ReadonlySet<string>>(
    () => new Set(rows.filter((row) => row.live !== null).map((row) => row.id)),
  );
  const flown = useRef<Set<string> | null>(null);
  flown.current ??= new Set(landed);

  const [scope, setScope] = useState<string | null>(null);
  /** the same box twice is a close: one toggle for the card and its name button */
  const toggleScope = useCallback(
    (id: string) => setScope((current) => (current === id ? null : id)),
    [],
  );

  const bodyOf = useCallback((id: string) => FLOOR.bodies.find((body) => body.id === id), []);

  const resolved = useMemo(() => {
    const out: { row: Row; verdict: Verdict }[] = [];
    for (const row of rows) {
      const answers = answersOf(row);
      if (answers && !row.pending) out.push({ row, verdict: verdictOf(answers, params) });
    }
    return out;
  }, [rows, params]);

  const waiting = useMemo(() => rows.filter((row) => answersOf(row) === null), [rows]);

  /** A ticket counts for its team once it has landed, not when the answer arrives. */
  const arrivals = useMemo(() => {
    const byNode = new Map<string, Arrival[]>(NODE_IDS.map((id) => [id, []]));
    for (const entry of resolved) {
      if (!landed.has(entry.row.id)) continue;
      byNode.get(bucketOf(entry.verdict.team))?.push(entry);
    }
    return byNode;
  }, [resolved, landed]);

  // ---------------------------------------------------------------- camera
  const applyView = useCallback(() => {
    const current = view.current;
    if (world.current) {
      world.current.style.transform = `translate(${current.x}px, ${current.y}px) scale(${current.k})`;
    }
    if (viewport.current) {
      viewport.current.style.backgroundSize = `${GRID * current.k}px ${GRID * current.k}px`;
      viewport.current.style.backgroundPosition = `${current.x}px ${current.y}px`;
    }
    FLOOR.view = current;
    onZoomRef.current?.(Math.round(current.k * 100));
  }, []);

  const frameAll = useCallback(() => {
    const box = viewport.current?.getBoundingClientRect();
    if (!box) return;
    view.current = fit(FLOOR.bodies, { width: box.width, height: box.height }, FRAME_PADDING);
    applyView();
  }, [applyView]);

  const zoomBy = useCallback(
    (factor: number, px?: number, py?: number) => {
      const box = viewport.current?.getBoundingClientRect();
      if (!box) return;
      FLOOR.userMoved = true;
      view.current = zoomAt(view.current, px ?? box.width / 2, py ?? box.height / 2, factor);
      applyView();
    },
    [applyView],
  );

  const tidy = useCallback(() => {
    for (const body of FLOOR.bodies) homing.current.add(body.id);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => zoomBy(1.25),
      zoomOut: () => zoomBy(0.8),
      frame: frameAll,
      tidy,
    }),
    [zoomBy, frameAll, tidy],
  );

  // ---------------------------------------------------------------- frames
  useEffect(() => {
    reduced.current = prefersReducedMotion();

    const frame = () => {
      const list = FLOOR.bodies;
      const dt = gsap.ticker.deltaRatio() * FRAME_MS;
      const grabbed = held.current;
      let moved = false;

      const next = list.map((body) => {
        let after: Body;
        if (grabbed && grabbed.id === body.id) {
          const x = clamp(
            lead(body.x, grabbed.tx, dt),
            FLOOR_BOUNDS.x,
            FLOOR_BOUNDS.x + FLOOR_BOUNDS.w - body.w,
          );
          const y = clamp(
            lead(body.y, grabbed.ty, dt),
            FLOOR_BOUNDS.y,
            FLOOR_BOUNDS.y + FLOOR_BOUNDS.h - body.h,
          );
          // the held card's velocity is its travel this frame, so letting go throws it
          after = {
            ...body,
            x,
            y,
            px: x,
            py: y,
            vx: clamp(x - body.px, -MAX_V, MAX_V),
            vy: clamp(y - body.py, -MAX_V, MAX_V),
          };
        } else if (homing.current.has(body.id)) {
          const x = lead(body.x, body.home.x, dt);
          const y = lead(body.y, body.home.y, dt);
          const settled = Math.abs(x - body.home.x) < 0.5 && Math.abs(y - body.home.y) < 0.5;
          if (settled) homing.current.delete(body.id);
          const at = settled ? body.home : { x, y };
          after = { ...body, x: at.x, y: at.y, px: at.x, py: at.y, vx: 0, vy: 0 };
        } else {
          const free = integrate(body, dt, FLOOR_BOUNDS);
          after = { ...free, px: free.x, py: free.y };
        }
        if (after.x !== body.x || after.y !== body.y) moved = true;
        return after;
      });

      FLOOR.bodies = next;
      // a still floor costs nothing: no DOM write, no route redraw
      if (!moved) return;
      for (const body of next) {
        const element = elements.current.get(body.id);
        if (element) {
          gsap.set(element, { x: body.x, y: body.y, rotation: reduced.current ? 0 : tilt(body.vx) });
        }
      }
      drawRoutes(routes.current, bodyOf);
    };

    // the loop only redraws on frames where something moved, so the wiring
    // needs its first draw here or a floor nobody has touched has no routes
    drawRoutes(routes.current, bodyOf);

    gsap.ticker.add(frame);
    return () => gsap.ticker.remove(frame);
  }, [bodyOf]);

  // ------------------------------------------------------- pan, zoom, drag
  useEffect(() => {
    const surface = viewport.current;
    if (!surface) return;

    const pointers = new Map<number, { x: number; y: number }>();
    let panFrom: { px: number; py: number; vx: number; vy: number } | null = null;
    let pinchFrom: { cx: number; cy: number; d: number } | null = null;
    let downAt: { x: number; y: number } | null = null;
    /** the card the press started on, and the pile it started inside */
    let pressed: string | null = null;
    let scrolling: { pane: HTMLElement; y: number } | null = null;
    let grabDx = 0;
    let grabDy = 0;

    const toWorld = (clientX: number, clientY: number) => {
      const box = surface.getBoundingClientRect();
      const current = view.current;
      return {
        x: (clientX - box.left - current.x) / current.k,
        y: (clientY - box.top - current.y) / current.k,
      };
    };

    const pinchState = () => {
      const [a, b] = [...pointers.values()];
      if (!a || !b) return null;
      return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    };

    const releaseHeld = () => {
      const grabbed = held.current;
      if (!grabbed) return;
      const element = elements.current.get(grabbed.id);
      if (element) element.dataset.held = "false";
      // the velocity the last frame measured is what carries it on
      held.current = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const interactive = target?.closest("button, input, a, textarea, [role='slider']");
      const pane = target?.closest<HTMLElement>("[data-scroll]");
      // stops the browser starting a selection drag; controls keep their own behaviour
      if (!interactive) event.preventDefault();

      // No setPointerCapture: capturing on the viewport retargets the
      // compatibility mouse events with it, so `click` lands on the viewport
      // instead of the button under the finger and every control on the floor
      // stops working. Window-level move and up listeners cover the same
      // ground — a drag that leaves the viewport still ends correctly.
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      downAt = { x: event.clientX, y: event.clientY };
      dragged.current = false;

      const card = target?.closest<HTMLElement>("[data-card]");
      const id = card?.dataset.card;
      // the name button toggles the scope itself; letting the press do it too
      // would flip it twice and leave the sheet where it was
      pressed = pointers.size === 1 && !interactive ? (id ?? null) : null;

      // the pile under the pointer scrolls itself, so neither the card nor the
      // camera moves while a finger or a mouse drags inside it
      if (pane && pointers.size === 1) {
        scrolling = { pane, y: event.clientY };
        return;
      }

      if (card && id && pointers.size === 1) {
        const body = bodyOf(id);
        if (body) {
          const point = toWorld(event.clientX, event.clientY);
          grabDx = point.x - body.x;
          grabDy = point.y - body.y;
          homing.current.delete(id);
          FLOOR.bodies = FLOOR.bodies.map((node) => (node.id === id ? { ...node, vx: 0, vy: 0 } : node));
          held.current = { id, tx: body.x, ty: body.y };
          card.dataset.held = "true";
          return;
        }
      }

      if (pointers.size === 1) {
        panFrom = { px: event.clientX, py: event.clientY, vx: view.current.x, vy: view.current.y };
        surface.dataset.panning = "true";
      } else if (pointers.size === 2) {
        releaseHeld();
        panFrom = null;
        pinchFrom = pinchState();
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (downAt && Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) >= CLICK_SLOP) {
        dragged.current = true;
      }

      if (scrolling) {
        scrolling.pane.scrollTop -= event.clientY - scrolling.y;
        scrolling = { ...scrolling, y: event.clientY };
        return;
      }

      const grabbed = held.current;
      if (grabbed) {
        const point = toWorld(event.clientX, event.clientY);
        held.current = { ...grabbed, tx: point.x - grabDx, ty: point.y - grabDy };
        return;
      }
      FLOOR.userMoved = true;

      if (pointers.size === 2 && pinchFrom) {
        const now = pinchState();
        if (!now) return;
        const box = surface.getBoundingClientRect();
        view.current = zoomAt(view.current, now.cx - box.left, now.cy - box.top, now.d / pinchFrom.d);
        view.current = {
          ...view.current,
          x: view.current.x + (now.cx - pinchFrom.cx),
          y: view.current.y + (now.cy - pinchFrom.cy),
        };
        applyView();
        pinchFrom = now;
        return;
      }

      if (panFrom) {
        view.current = {
          ...view.current,
          x: panFrom.vx + (event.clientX - panFrom.px),
          y: panFrom.vy + (event.clientY - panFrom.py),
        };
        applyView();
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchFrom = null;
      if (pointers.size > 0) return;
      releaseHeld();
      // a press that never travelled is a click on the card, whatever part of
      // it was under the pointer; a throw or a scroll is not
      if (pressed && !dragged.current) toggleScope(pressed);
      pressed = null;
      scrolling = null;
      panFrom = null;
      downAt = null;
      surface.dataset.panning = "false";
    };

    // a drag that ended over a control must not also activate it
    const onClickCapture = (event: MouseEvent) => {
      if (!dragged.current) return;
      dragged.current = false;
      event.preventDefault();
      event.stopPropagation();
    };

    const onWheel = (event: WheelEvent) => {
      // a pile under the pointer takes the wheel; the camera only zooms elsewhere
      if ((event.target as HTMLElement | null)?.closest("[data-scroll]")) return;
      event.preventDefault();
      const box = surface.getBoundingClientRect();
      // exp keeps each notch a constant ratio, so zoom feels the same at any scale
      zoomBy(Math.exp(-event.deltaY * 0.0016), event.clientX - box.left, event.clientY - box.top);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // arrows belong to the focused pile when the reader is inside one
      if ((event.target as HTMLElement | null)?.closest("[data-scroll]")) return;
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [KEY_PAN, 0],
        ArrowRight: [-KEY_PAN, 0],
        ArrowUp: [0, KEY_PAN],
        ArrowDown: [0, -KEY_PAN],
      };
      const pan = nudge[event.key];
      if (pan) {
        event.preventDefault();
        FLOOR.userMoved = true;
        view.current = { ...view.current, x: view.current.x + pan[0], y: view.current.y + pan[1] };
        applyView();
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomBy(1.25);
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoomBy(0.8);
      }
      if (event.key === "0") {
        event.preventDefault();
        frameAll();
      }
    };

    surface.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    surface.addEventListener("click", onClickCapture, true);
    surface.addEventListener("wheel", onWheel, { passive: false });
    surface.addEventListener("keydown", onKeyDown);

    return () => {
      surface.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      surface.removeEventListener("click", onClickCapture, true);
      surface.removeEventListener("wheel", onWheel);
      surface.removeEventListener("keydown", onKeyDown);
    };
  }, [applyView, bodyOf, frameAll, zoomBy, toggleScope]);

  // frame on first paint, and on resize until the reader takes the camera over
  useEffect(() => {
    const surface = viewport.current;
    if (!surface) return;
    // a reader who has moved the camera keeps it, including across a route
    if (!FLOOR.view) frameAll();
    else applyView();
    const observer = new ResizeObserver(() => {
      if (!FLOOR.userMoved) frameAll();
    });
    observer.observe(surface);
    return () => observer.disconnect();
  }, [frameAll, applyView]);

  // ---------------------------------------------------------------- flight
  useEffect(() => {
    // A reset clears the evidence, so those tickets are free to fly again. The
    // signal is a ticket that is back to having no answer, not one that left
    // the list: a filter also takes rows away, and a hidden ticket has flown.
    const cleared = new Set(waiting.map((row) => row.id));
    const seen = flown.current as Set<string>;
    for (const id of seen) if (cleared.has(id)) seen.delete(id);
    setLanded((current) => {
      const stale = [...current].filter((id) => cleared.has(id));
      if (stale.length === 0) return current;
      const next = new Set(current);
      for (const id of stale) next.delete(id);
      return next;
    });

    const settle = (id: string, node: string) => {
      setLanded((current) => new Set(current).add(id));
      if (reduced.current) return;
      const element = elements.current.get(node);
      // a card already raised under the pointer keeps its lift; the arrival
      // pulse would end by dropping it back to rest under the reader's hand
      if (!element || element.matches(":hover")) return;
      gsap.fromTo(
        element,
        { scale: 1 },
        { scale: 1.015, duration: 0.14, yoyo: true, repeat: 1, ease: "power2.out", overwrite: "auto" },
      );
    };

    for (const { row, verdict } of resolved) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);

      const node = bucketOf(verdict.team);
      const layer = flyers.current;
      if (!layer || reduced.current || inFlight.current >= MAX_FLIGHTS) {
        settle(row.id, node);
        continue;
      }

      inFlight.current += 1;
      launchFlight({
        layer,
        curveOf: () => {
          const inbox = bodyOf(INBOX_ID);
          const target = bodyOf(node);
          return inbox && target ? routeCurve(inbox, target) : null;
        },
        subject: row.subject,
        priority: verdict.priority,
        onLand: () => {
          inFlight.current -= 1;
          settle(row.id, node);
        },
      });
    }
  }, [resolved, waiting, bodyOf]);

  // ----------------------------------------------------------------- sheet
  const register = useCallback((id: string, element: HTMLElement | null) => {
    if (!element) {
      elements.current.delete(id);
      return;
    }
    elements.current.set(id, element);
    const body = FLOOR.bodies.find((node) => node.id === id);
    if (body) gsap.set(element, { x: body.x, y: body.y });
  }, []);

  const entries: SheetEntry[] = useMemo(() => {
    if (scope === null) return [];
    if (scope === INBOX_ID) {
      return waiting.map((row) => ({
        id: row.id,
        subject: row.subject,
        priority: null,
        team: null,
        urgency: null,
        latencyMs: null,
        // the run has to have asked before this ticket is waiting on an answer
        status: row.pending ? "asking" : "queued",
        transit: false,
      }));
    }
    return resolved
      .filter(({ verdict }) => bucketOf(verdict.team) === scope)
      .map(({ row, verdict }) => ({
        id: row.id,
        subject: row.subject,
        priority: verdict.priority,
        team: verdict.team,
        urgency: verdict.urgency,
        latencyMs: row.live?.latencyMs ?? null,
        status: "routed" as const,
        transit: !landed.has(row.id),
      }))
      .reverse();
  }, [scope, waiting, resolved, landed]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        ref={viewport}
        tabIndex={0}
        role="application"
        aria-label="Triage floor. Drag the background to pan, drag a card to move it, scroll to zoom. Arrow keys pan, plus and minus zoom, zero frames everything."
        data-panning="false"
        style={{
          backgroundImage: "radial-gradient(circle at center, var(--floor-dot) 1px, transparent 1px)",
          backgroundSize: `${GRID}px ${GRID}px`,
          backgroundColor: "var(--floor)",
        }}
        // the base :focus-visible rule draws the ring; only the offset is pulled
        // inside, because an outward offset on a full-bleed element is off screen
        className="absolute inset-0 touch-none overflow-hidden focus-visible:-outline-offset-[3px] data-[panning=false]:cursor-grab data-[panning=true]:cursor-grabbing"
      >
        <div ref={world} className="no-select absolute top-0 left-0 origin-top-left">
          <Routes ref={routes} />
          <Flyers ref={flyers} />

          <InboxCard
            box={HOME[INBOX_ID] ?? { x: 0, y: 0, w: 300, h: 800 }}
            waiting={waiting}
            register={register}
            onOpenScope={toggleScope}
            poolSize={poolSize}
          />

          {NODE_IDS.map((id) => (
            <TeamCard
              key={id}
              id={id}
              box={HOME[id] ?? { x: 0, y: 0, w: 300, h: 240 }}
              arrivals={arrivals.get(id) ?? []}
              register={register}
              onOpenScope={toggleScope}
            />
          ))}
        </div>
      </div>

      <Sheet
        scope={scope}
        title={scope === INBOX_ID ? "Unrouted inbox" : scope ? nodeName(scope) : ""}
        entries={entries}
        filter={filter}
        onFilter={onFilter}
        onClose={() => setScope(null)}
      />
    </div>
  );
}
