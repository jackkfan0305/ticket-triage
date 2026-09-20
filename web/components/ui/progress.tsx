"use client";

import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { cn } from "cn";

type ProgressProps = ProgressPrimitive.Root.Props & {
  /** Where to draw a threshold tick across the track, 0..100. */
  mark?: number;
  trackClassName?: string;
  indicatorClassName?: string;
};

/**
 * Root and Track come from Base UI, which supplies role="progressbar" and the
 * aria-value* trio. The fill is ours: Base UI's own indicator animates `width`,
 * and this page settles a lot of bars at once, so it scales a block instead.
 */
function Progress({
  className,
  children,
  value,
  min = 0,
  max = 100,
  mark,
  trackClassName,
  indicatorClassName,
  ...props
}: ProgressProps) {
  const span = max - min || 1;
  const fraction = value == null ? 0 : Math.min(1, Math.max(0, (value - min) / span));

  return (
    <ProgressPrimitive.Root
      value={value}
      min={min}
      max={max}
      data-slot="progress"
      className={cn("flex flex-wrap gap-3", className)}
      {...props}
    >
      {children}
      <ProgressPrimitive.Track
        data-slot="progress-track"
        className={cn("relative h-2 w-full overflow-visible rounded-[3px] bg-track", trackClassName)}
      >
        <span
          data-slot="progress-indicator"
          aria-hidden="true"
          className={cn(
            "absolute inset-0 block origin-left rounded-[3px] bg-primary",
            "motion-safe:transition-transform motion-safe:duration-[--duration-normal] motion-safe:ease-[--ease-out-expo]",
            indicatorClassName,
          )}
          style={{ transform: `scaleX(${fraction})` }}
        />
        {mark != null && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -bottom-1 w-0.5 rounded-[1px] bg-ink opacity-55"
            style={{ left: `${Math.min(100, Math.max(0, mark))}%` }}
          />
        )}
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
}

export { Progress };
