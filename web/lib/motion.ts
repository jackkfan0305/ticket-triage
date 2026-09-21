"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";

gsap.registerPlugin(useGSAP);

gsap.defaults({ duration: 0.34, ease: "power2.out" });

export const EASE_SETTLE = "expo.out";

/**
 * JS motion is guarded here as well as in CSS. Every animation on this page is
 * decoration over a state that is already correct in the DOM, so skipping it
 * loses nothing.
 */
export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export { gsap, useGSAP };
