"use client";

import type { Priority } from "../../../src/types";
import { gsap } from "@/lib/motion";
import { bezierAt, type Curve } from "./routes";

/** Beyond this many at once the flights read as noise, so the rest land
 *  straight onto their team and only the counts move. */
export const MAX_FLIGHTS = 10;

const FLYER_W = 180;
const BASE_TRAVEL_S = 1.15;

const EDGE: Record<Priority, string> = {
  low: "var(--p-low)",
  normal: "var(--p-normal)",
  high: "var(--p-high)",
  urgent: "var(--p-urgent)",
};

type FlightOptions = {
  layer: HTMLElement;
  /** read fresh on every frame, so a card dragged mid-flight keeps its traffic */
  curveOf: () => Curve | null;
  subject: string;
  priority: Priority;
  speed: number;
  onLand: () => void;
};

/**
 * One ticket crossing the floor. Translation goes on the outer element and
 * scale and fade on the inner one, so the two tweens never write the same
 * transform and fight each other.
 */
export function launchFlight({ layer, curveOf, subject, priority, speed, onLand }: FlightOptions): void {
  const flyer = document.createElement("div");
  flyer.className = "pointer-events-none absolute top-0 left-0";
  flyer.style.width = `${FLYER_W}px`;

  const inner = document.createElement("div");
  inner.className =
    "overflow-hidden rounded-[10px] border border-line bg-panel px-2.5 py-[7px] text-[11px] leading-[1.25] text-ink shadow-xl";
  inner.style.borderLeft = `3px solid ${EDGE[priority]}`;
  inner.style.maxHeight = "44px";
  inner.textContent = subject || "(untitled)";

  flyer.appendChild(inner);
  layer.appendChild(flyer);

  const travel = BASE_TRAVEL_S / Math.sqrt(speed);
  const at = { t: 0 };

  gsap.to(at, {
    t: 1,
    duration: travel,
    ease: "power1.inOut",
    onUpdate: () => {
      const curve = curveOf();
      if (!curve) return;
      const point = bezierAt(curve, at.t);
      gsap.set(flyer, { x: point.x - FLYER_W / 2, y: point.y - 22 });
    },
    onComplete: () => {
      flyer.remove();
      onLand();
    },
  });

  gsap.fromTo(
    inner,
    { scale: 0.8, autoAlpha: 0 },
    { scale: 1, autoAlpha: 1, duration: travel * 0.18, ease: "power2.out" },
  );
  gsap.to(inner, {
    scale: 0.45,
    autoAlpha: 0,
    duration: travel * 0.22,
    delay: travel * 0.8,
    ease: "power2.in",
  });
}

export function Flyers({ ref }: { ref: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} aria-hidden="true" className="pointer-events-none absolute top-0 left-0 z-[4]" />;
}
