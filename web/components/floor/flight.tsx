"use client";

import type { Priority } from "../../../src/types";
import { gsap } from "@/lib/motion";
import { PRIORITY_MARKER_CLASS, priorityMarkerPath } from "../workbench/priority-marker";
import { bezierAt, type Curve } from "./routes";

/** Beyond this many at once the flights read as noise, so the rest land
 *  straight onto their team and only the counts move. */
export const MAX_FLIGHTS = 10;

const FLYER_W = 180;
const TRAVEL_S = 1.15;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

type FlightOptions = {
  layer: HTMLElement;
  /** read fresh on every frame, so a card dragged mid-flight keeps its traffic */
  curveOf: () => Curve | null;
  subject: string;
  priority: Priority;
  onLand: () => void;
};

/**
 * One ticket crossing the floor. Translation goes on the outer element and
 * scale and fade on the inner one, so the two tweens never write the same
 * transform and fight each other.
 */
export function launchFlight({ layer, curveOf, subject, priority, onLand }: FlightOptions): void {
  const flyer = document.createElement("div");
  flyer.className = "pointer-events-none absolute top-0 left-0";
  flyer.dataset.ticketFlight = "true";
  flyer.style.width = `${FLYER_W}px`;

  const inner = document.createElement("div");
  inner.className =
    "flex items-center gap-[7px] overflow-hidden rounded-full border border-line bg-panel-2 px-2 py-[3px] text-[11px] leading-[1.5] text-ink shadow-sm";
  const marker = document.createElementNS(SVG_NAMESPACE, "svg");
  marker.setAttribute("viewBox", "0 0 16 12");
  marker.setAttribute("class", PRIORITY_MARKER_CLASS);
  marker.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("d", priorityMarkerPath(priority));
  marker.appendChild(path);
  const label = document.createElement("span");
  label.className = "min-w-0 flex-1 truncate text-ink-2";
  label.textContent = subject || "(untitled)";
  inner.append(marker, label);

  flyer.appendChild(inner);
  layer.appendChild(flyer);
  const flyerHeight = inner.offsetHeight;

  const at = { t: 0 };

  gsap.to(at, {
    t: 1,
    duration: TRAVEL_S,
    ease: "power1.inOut",
    onUpdate: () => {
      const curve = curveOf();
      if (!curve) return;
      const point = bezierAt(curve, at.t);
      gsap.set(flyer, { x: point.x - FLYER_W / 2, y: point.y - flyerHeight / 2 });
    },
    onComplete: () => {
      flyer.remove();
      onLand();
    },
  });

  gsap.fromTo(
    inner,
    { scale: 0.8, autoAlpha: 0 },
    { scale: 1, autoAlpha: 1, duration: TRAVEL_S * 0.18, ease: "power2.out" },
  );
  gsap.to(inner, {
    scale: 0.45,
    autoAlpha: 0,
    duration: TRAVEL_S * 0.22,
    delay: TRAVEL_S * 0.8,
    ease: "power2.in",
  });
}

export function Flyers({ ref }: { ref: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} aria-hidden="true" className="pointer-events-none absolute top-0 left-0 z-[4]" />;
}
