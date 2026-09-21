import type { Priority } from "../../../src/types";

const BAR_COUNT: Record<Priority, number> = { urgent: 3, high: 2, normal: 1, low: 0 };

export const PRIORITY_MARKER_CLASS = "h-3 w-4 shrink-0 fill-current";

export function priorityMarkerPath(priority: Priority): string {
  if (priority === "low") return "M4.5 6a1.5 1.5 0 1 0-3 0a1.5 1.5 0 1 0 3 0";
  return Array.from({ length: BAR_COUNT[priority] }, (_, index) => {
    const x = 1 + index * 5;
    return `M${x + 0.5} 1h2q.5 0 .5 .5v9q0 .5-.5 .5h-2q-.5 0-.5-.5v-9q0-.5 .5-.5Z`;
  }).join(" ");
}

export function PriorityMarker({ priority }: { priority: Priority | null }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 12" className={PRIORITY_MARKER_CLASS}>
      {priority === null ? (
        <circle cx="3" cy="6" r="2" fill="none" stroke="currentColor" />
      ) : (
        <path d={priorityMarkerPath(priority)} />
      )}
    </svg>
  );
}
