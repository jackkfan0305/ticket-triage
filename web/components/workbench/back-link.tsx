import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-sm pe-2 text-meta font-medium text-ink-2 hover:text-ink"
    >
      <ChevronLeft aria-hidden="true" className="size-4" />
      <span className="decoration-line underline-offset-4 group-hover:underline">{label}</span>
    </Link>
  );
}
