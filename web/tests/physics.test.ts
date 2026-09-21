import { describe, expect, test } from "bun:test";
import {
  BOUNCE,
  FRAME_MS,
  MAX_K,
  MIN_K,
  decay,
  fit,
  integrate,
  lead,
  spread,
  tilt,
  zoomAt,
  type Body,
  type Bounds,
} from "../lib/physics";

const BOUNDS: Bounds = { x: 0, y: 0, w: 1000, h: 800 };

const body = (patch: Partial<Body> = {}): Body => ({
  id: "a",
  x: 100,
  y: 100,
  px: 100,
  py: 100,
  w: 200,
  h: 150,
  vx: 0,
  vy: 0,
  home: { x: 100, y: 100 },
  ...patch,
});

describe("decay", () => {
  test("loses the same fraction per unit of time whatever the frame rate", () => {
    const once = decay(10, FRAME_MS * 2);
    const twice = decay(decay(10, FRAME_MS), FRAME_MS);
    expect(once).toBeCloseTo(twice, 10);
  });

  test("a coasting body reaches rest rather than creeping forever", () => {
    let v = 60;
    let frames = 0;
    // integrate zeroes anything under 0.01; decay alone only approaches it
    while (Math.abs(v) >= 0.01 && frames < 1000) {
      v = decay(v, FRAME_MS);
      frames += 1;
    }
    expect(frames).toBeLessThan(200);
    expect(Math.abs(v)).toBeLessThan(0.01);
  });
});

describe("lead", () => {
  test("closes the gap without overshooting the pointer", () => {
    const next = lead(0, 100, FRAME_MS);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(100);
  });

  test("a double-length frame lands where two single frames would", () => {
    const once = lead(0, 100, FRAME_MS * 2);
    const twice = lead(lead(0, 100, FRAME_MS), 100, FRAME_MS);
    expect(once).toBeCloseTo(twice, 10);
  });
});

describe("integrate", () => {
  test("leaves its argument untouched", () => {
    const before = body({ vx: 12 });
    const snapshot = { ...before };
    integrate(before, FRAME_MS, BOUNDS);
    expect(before).toEqual(snapshot);
  });

  test("carries a body along its own velocity", () => {
    const next = integrate(body({ vx: 10, vy: -4 }), FRAME_MS, BOUNDS);
    expect(next.x).toBeCloseTo(110, 6);
    expect(next.y).toBeCloseTo(96, 6);
  });

  test("bounces off the left wall and reverses the velocity", () => {
    const next = integrate(body({ x: 5, px: 5, vx: -40 }), FRAME_MS, BOUNDS);
    expect(next.x).toBe(BOUNDS.x);
    expect(next.vx).toBeGreaterThan(0);
    expect(next.vx).toBeLessThan(40 * BOUNCE + 1);
  });

  test("bounces off the right wall, which sits at the far edge less the card", () => {
    const next = integrate(body({ x: 790, px: 790, vx: 40 }), FRAME_MS, BOUNDS);
    expect(next.x).toBe(BOUNDS.w - 200);
    expect(next.vx).toBeLessThan(0);
  });

  test("never lets a throw exceed the speed cap", () => {
    const next = integrate(body({ vx: 5000 }), FRAME_MS, BOUNDS);
    expect(next.x - 100).toBeLessThanOrEqual(70);
  });

  test("a body at rest stays exactly where it is", () => {
    const at = body();
    const next = integrate(at, FRAME_MS, BOUNDS);
    expect(next.x).toBe(at.x);
    expect(next.y).toBe(at.y);
  });
});

test("tilt leans with horizontal speed and stays within six degrees", () => {
  expect(tilt(0)).toBe(0);
  expect(tilt(10)).toBeCloseTo(3.5, 6);
  expect(tilt(999)).toBe(6);
  expect(tilt(-999)).toBe(-6);
});

describe("zoomAt", () => {
  test("holds the point under the cursor fixed", () => {
    const view = { x: -120, y: 40, k: 0.8 };
    const [px, py] = [300, 220];
    const worldBefore = { x: (px - view.x) / view.k, y: (py - view.y) / view.k };

    const next = zoomAt(view, px, py, 1.6);
    const worldAfter = { x: (px - next.x) / next.k, y: (py - next.y) / next.k };

    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 8);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 8);
  });

  test("clamps to the zoom range and leaves the argument alone", () => {
    const view = { x: 0, y: 0, k: 1 };
    expect(zoomAt(view, 0, 0, 100).k).toBe(MAX_K);
    expect(zoomAt(view, 0, 0, 0.001).k).toBe(MIN_K);
    expect(view.k).toBe(1);
  });
});

describe("fit", () => {
  const two = [
    body({ id: "a", x: 0, y: 0, w: 200, h: 100 }),
    body({ id: "b", x: 800, y: 400, w: 200, h: 100 }),
  ];

  test("spread covers both bodies", () => {
    expect(spread(two)).toEqual({ x: 0, y: 0, w: 1000, h: 500 });
  });

  test("frames a two-body spread inside the padded viewport", () => {
    const padding = { x: 40, top: 100, bottom: 80 };
    const view = fit(two, { width: 1440, height: 900 }, padding);

    for (const node of two) {
      const left = node.x * view.k + view.x;
      const top = node.y * view.k + view.y;
      const right = (node.x + node.w) * view.k + view.x;
      const bottom = (node.y + node.h) * view.k + view.y;
      expect(left).toBeGreaterThanOrEqual(padding.x - 0.001);
      expect(top).toBeGreaterThanOrEqual(padding.top - 0.001);
      expect(right).toBeLessThanOrEqual(1440 - padding.x + 0.001);
      expect(bottom).toBeLessThanOrEqual(900 - padding.bottom + 0.001);
    }
  });

  test("falls back to an identity view when there is nothing to frame", () => {
    expect(fit([], { width: 1440, height: 900 }, { x: 0, top: 0, bottom: 0 })).toEqual({
      x: 0,
      y: 0,
      k: 1,
    });
  });
});
