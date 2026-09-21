/**
 * The motion model behind the triage floor. Pure functions only: no DOM, no
 * GSAP, no React, so every rule here is testable in isolation.
 *
 * Cards do not interact. Nothing in this file reads a second body, because a
 * card must go exactly where the reader throws it and stay there. The only
 * force in the system is friction, and the only wall is the floor's edge.
 */

export type Bounds = { x: number; y: number; w: number; h: number };
export type View = { x: number; y: number; k: number };
export type Viewport = { width: number; height: number };
export type Padding = { x: number; top: number; bottom: number };

export type Body = {
  id: string;
  x: number;
  y: number;
  /** position at the end of the previous frame; the held card's velocity is the difference */
  px: number;
  py: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  home: { x: number; y: number };
};

/** One frame at 60Hz. Every rate below is expressed per this, then scaled by
 *  the real delta, so a 120Hz display feels identical rather than twice as fast. */
export const FRAME_MS = 1000 / 60;

export const FRICTION = 0.94;
export const MAX_V = 70;
export const BOUNCE = 0.3;
export const LEAD = 0.45;
export const MIN_K = 0.18;
export const MAX_K = 2.4;

/** Below this a body is at rest; without it a card creeps for minutes. */
const REST_V = 0.01;
const TILT_PER_V = 0.35;
const MAX_TILT = 6;

export const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, value));

export const decay = (v: number, dt: number): number => v * Math.pow(FRICTION, dt / FRAME_MS);

/** Time-corrected lerp. The held card trails the pointer by a constant amount
 *  of time rather than a constant fraction per frame, which is what gives it
 *  weight without reading as lag. */
export const lead = (current: number, target: number, dt: number): number =>
  current + (target - current) * (1 - Math.pow(1 - LEAD, dt / FRAME_MS));

/** Advances one free body. Returns a new body; the argument is never touched. */
export function integrate(body: Body, dt: number, bounds: Bounds): Body {
  const steps = dt / FRAME_MS;
  let vx = clamp(body.vx, -MAX_V, MAX_V);
  let vy = clamp(body.vy, -MAX_V, MAX_V);

  let x = body.x + vx * steps;
  let y = body.y + vy * steps;

  vx = decay(vx, dt);
  vy = decay(vy, dt);
  if (Math.abs(vx) < REST_V) vx = 0;
  if (Math.abs(vy) < REST_V) vy = 0;

  const maxX = bounds.x + bounds.w - body.w;
  const maxY = bounds.y + bounds.h - body.h;

  if (x < bounds.x) {
    x = bounds.x;
    vx = Math.abs(vx) * BOUNCE;
  } else if (x > maxX) {
    x = maxX;
    vx = -Math.abs(vx) * BOUNCE;
  }
  if (y < bounds.y) {
    y = bounds.y;
    vy = Math.abs(vy) * BOUNCE;
  } else if (y > maxY) {
    y = maxY;
    vy = -Math.abs(vy) * BOUNCE;
  }

  return { ...body, x, y, vx, vy };
}

/** Degrees of lean from horizontal speed. Decoration, so reduced motion drops it. */
export const tilt = (vx: number): number => clamp(vx * TILT_PER_V, -MAX_TILT, MAX_TILT);

/** The box every body currently occupies, in world coordinates. */
export function spread(bodies: readonly Body[]): Bounds {
  const first = bodies[0];
  if (!first) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = first.x;
  let y0 = first.y;
  let x1 = first.x + first.w;
  let y1 = first.y + first.h;
  for (const body of bodies) {
    x0 = Math.min(x0, body.x);
    y0 = Math.min(y0, body.y);
    x1 = Math.max(x1, body.x + body.w);
    y1 = Math.max(y1, body.y + body.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Frames whatever arrangement the reader has made, leaving the padding the
 * floating chrome needs rather than centring blindly in the viewport.
 */
export function fit(bodies: readonly Body[], viewport: Viewport, padding: Padding): View {
  const box = spread(bodies);
  if (box.w <= 0 || box.h <= 0 || viewport.width < 60 || viewport.height < 60) {
    return { x: 0, y: 0, k: 1 };
  }
  const availW = Math.max(120, viewport.width - padding.x * 2);
  const availH = Math.max(120, viewport.height - padding.top - padding.bottom);
  const k = clamp(Math.min(availW / box.w, availH / box.h), MIN_K, MAX_K);
  return {
    x: padding.x + (availW - box.w * k) / 2 - box.x * k,
    y: padding.top + (availH - box.h * k) / 2 - box.y * k,
    k,
  };
}

/** Zooms about a point in viewport space, so whatever sits under the cursor
 *  stays under the cursor. Returns a new view. */
export function zoomAt(view: View, px: number, py: number, factor: number): View {
  const k = clamp(view.k * factor, MIN_K, MAX_K);
  const ratio = k / view.k;
  return { x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio, k };
}
