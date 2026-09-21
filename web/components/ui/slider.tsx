"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "cn";

type SliderProps = SliderPrimitive.Root.Props & {
  /** Names the thumb. Base UI's hidden range input has no label of its own. */
  "aria-label"?: string;
};

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  "aria-label": ariaLabel,
  ...props
}: SliderProps) {
  // A scalar value means one thumb. The stock wrapper only checked for arrays
  // and fell through to [min, max], which rendered two thumbs on every slider.
  const current = value ?? defaultValue;
  const thumbs = Array.isArray(current) ? current.length : 1;

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      {/* the whole control row is the pointer target, so it stays >= 24px tall */}
      <SliderPrimitive.Control className="relative flex min-h-6 w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-track select-none data-horizontal:h-[3px] data-horizontal:w-full data-vertical:h-full data-vertical:w-[3px]"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-primary select-none data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: thumbs }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            getAriaLabel={ariaLabel ? () => ariaLabel : undefined}
            className="relative block size-4 shrink-0 rounded-full border-2 border-panel bg-primary ring-1 ring-line ring-offset-0 select-none after:absolute after:-inset-2 hover:ring-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden active:ring-2 disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
