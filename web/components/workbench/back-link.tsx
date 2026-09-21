import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";

/**
 * One way back, the same on every surface that has one: a round target at 40px,
 * which is a comfortable hit rather than the 24px floor.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(buttonVariants({ variant: "outline", size: "icon" }), "size-10 rounded-full")}
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
    </Link>
  );
}
