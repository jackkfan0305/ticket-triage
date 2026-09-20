"use client";

import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/motion";

type CounterProps = {
  value: number;
  /** decimal places; the static text is always the exact value */
  places?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
};

/**
 * Tweens the printed number when it changes. The element is rendered with the
 * true value first, so a reader who never sees the animation still reads the
 * right figure.
 */
export function Counter({ value, places = 2, prefix = "", suffix = "", className }: CounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);

  const format = (n: number) => `${prefix}${n.toFixed(places)}${suffix}`;

  useGSAP(
    () => {
      const node = ref.current;
      if (!node) return;
      const from = shown.current;
      shown.current = value;
      // React has already written the true value into the node; the tween only
      // replays the distance travelled, so skipping it is safe.
      if (from === value || prefersReducedMotion()) return;

      const proxy = { n: from };
      gsap.to(proxy, {
        n: value,
        duration: 0.32,
        ease: "power2.out",
        onUpdate: () => {
          node.textContent = format(proxy.n);
        },
        onComplete: () => {
          node.textContent = format(value);
        },
      });
    },
    { dependencies: [value, places, prefix, suffix] },
  );

  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}
