"use client";

import type { Body } from "@/lib/physics";
import { FLOOR_BOUNDS, NODE_IDS } from "./layout";

export type Point = { x: number; y: number };
export type Curve = readonly [Point, Point, Point, Point];

const centreX = (body: Body) => body.x + body.w / 2;
const centreY = (body: Body) => body.y + body.h / 2;

/** How far down a team card the route meets it, so the wiring lands on the
 *  card's shoulder rather than its middle. */
const ENTRY_DROP = 58;

/**
 * One route, read from where the two cards are right now. A card dragged
 * across the floor takes its wiring with it, and a ticket in flight samples
 * this same curve, so traffic follows the card rather than a stale path.
 */
export function routeCurve(inbox: Body, node: Body): Curve {
  const fromLeft = centreX(node) >= centreX(inbox);
  const start: Point = { x: fromLeft ? inbox.x + inbox.w : inbox.x, y: centreY(inbox) };
  const end: Point = {
    x: fromLeft ? node.x : node.x + node.w,
    y: node.y + Math.min(ENTRY_DROP, node.h / 2),
  };
  const mid = (start.x + end.x) / 2;
  return [start, { x: mid, y: start.y }, { x: mid, y: end.y }, end];
}

export function bezierAt(curve: Curve, t: number): Point {
  const [p0, p1, p2, p3] = curve;
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

export const pathOf = (curve: Curve): string => {
  const [p0, p1, p2, p3] = curve;
  return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;
};

/**
 * Written straight to the DOM from the frame loop. Routes redraw only on
 * frames where a body actually moved, so a still floor costs nothing.
 */
export function drawRoutes(svg: SVGSVGElement | null, bodyOf: (id: string) => Body | undefined): void {
  if (!svg) return;
  const inbox = bodyOf("inbox");
  if (!inbox) return;
  for (const id of NODE_IDS) {
    const node = bodyOf(id);
    const path = svg.querySelector<SVGPathElement>(`path[data-node="${id}"]`);
    if (node && path) path.setAttribute("d", pathOf(routeCurve(inbox, node)));
  }
}

/** Wiring, never content: dashed, low contrast, and out of the a11y tree. */
export function Routes({ ref }: { ref: React.Ref<SVGSVGElement> }) {
  return (
    <svg
      ref={ref}
      aria-hidden="true"
      width={FLOOR_BOUNDS.w}
      height={FLOOR_BOUNDS.h}
      viewBox={`${FLOOR_BOUNDS.x} ${FLOOR_BOUNDS.y} ${FLOOR_BOUNDS.w} ${FLOOR_BOUNDS.h}`}
      style={{ left: FLOOR_BOUNDS.x, top: FLOOR_BOUNDS.y }}
      className="pointer-events-none absolute z-[1] block"
    >
      {NODE_IDS.map((id) => (
        <path
          key={id}
          data-node={id}
          fill="none"
          stroke="var(--route)"
          strokeWidth={1.4}
          strokeDasharray="4 6"
        />
      ))}
    </svg>
  );
}
