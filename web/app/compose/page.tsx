import type { Metadata } from "next";
import { ComposePage } from "@/components/workbench/compose-page";

export const metadata: Metadata = { title: "Write your own ticket" };

export default function Page() {
  return <ComposePage />;
}
