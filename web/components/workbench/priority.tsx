import type { Priority } from "../../../src/types";
import { Badge } from "@/components/ui/badge";

export const PRIORITY_TEXT: Record<Priority, string> = {
  low: "text-p-low",
  normal: "text-p-normal",
  high: "text-p-high",
  urgent: "text-p-urgent",
};

export const PRIORITY_STRIPE: Record<Priority, string> = {
  low: "bg-p-low",
  normal: "bg-p-normal",
  high: "bg-p-high",
  urgent: "bg-p-urgent",
};

const PRIORITY_CHIP: Record<Priority, string> = {
  low: "bg-[var(--p-low-bg)] text-p-low",
  normal: "bg-[var(--p-normal-bg)] text-p-normal",
  high: "bg-[var(--p-high-bg)] text-p-high",
  urgent: "bg-[var(--p-urgent-bg)] text-p-urgent",
};

export function PriorityChip({ priority }: { priority: Priority }) {
  return (
    <Badge
      className={`rounded border-0 px-1.5 py-0.5 text-[11px] font-normal tracking-[0.04em] uppercase ${PRIORITY_CHIP[priority]}`}
    >
      {priority}
    </Badge>
  );
}
