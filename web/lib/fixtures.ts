import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import type { Ticket } from "../../src/types";

const FIXTURES = path.join(process.cwd(), "..", "tests", "fixtures");

/**
 * Reads the eval set. Tickets only: there is no cached answer file any more,
 * so every classification on the board comes from a live run.
 *
 * Server only; the page hands the result to the client.
 */
export async function loadTickets(): Promise<Ticket[]> {
  const csv = await readFile(path.join(FIXTURES, "evalset.csv"), "utf8");
  const rows = parse(csv, { columns: true, skip_empty_lines: true }) as Ticket[];
  return rows.map(({ id, subject, body }) => ({ id, subject, body }));
}

/**
 * One ticket by id, for the route that renders it. The lookup lives here so a
 * page never parses the whole eval set to answer for a single row.
 *
 * Returns null for an unknown id; the page turns that into a 404.
 */
export async function loadTicket(id: string): Promise<Ticket | null> {
  const tickets = await loadTickets();
  return tickets.find((ticket) => ticket.id === id) ?? null;
}
