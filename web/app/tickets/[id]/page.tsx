import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TicketPage } from "@/components/workbench/ticket-page";
import { loadTicket } from "@/lib/fixtures";

type PageProps = { params: Promise<{ id: string }> };

/** A shared link should read as the ticket, not as the app. */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const ticket = await loadTicket(id);
  if (!ticket) return { title: "Ticket not found" };
  return { title: ticket.subject || `Ticket ${ticket.id}` };
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const ticket = await loadTicket(id);
  if (!ticket) notFound();
  return <TicketPage ticket={ticket} />;
}
