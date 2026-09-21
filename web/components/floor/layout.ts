import { TEAMS, type TeamId } from "../../../src/config/teams";
import type { Bounds } from "@/lib/physics";

/** Where a card starts and what Tidy returns it to. Not a layout: the reader
 *  rearranges the floor and the arrangement is theirs to keep. */
export type Box = { x: number; y: number; w: number; h: number };

/** Open space on every side of home, above it included, so dragging a card up
 *  never meets a wall a few hundred pixels from where it started. */
export const FLOOR_BOUNDS: Bounds = { x: -2000, y: -2000, w: 6600, h: 5800 };

export const INBOX_ID = "inbox";
/** Tickets no team owns land here. It is a holding pen, not a seventh team. */
export const NONE_ID = "none";

export type NodeId = TeamId | typeof NONE_ID;

export const NODE_IDS: NodeId[] = [
  "technical_support",
  "billing",
  "account_access",
  "onboarding",
  "sales",
  "product_feedback",
  NONE_ID,
];

export const HOME: Record<string, Box> = {
  [INBOX_ID]: { x: 40, y: 120, w: 300, h: 820 },
  technical_support: { x: 560, y: 70, w: 330, h: 270 },
  billing: { x: 960, y: 30, w: 290, h: 225 },
  account_access: { x: 1350, y: 150, w: 300, h: 235 },
  onboarding: { x: 520, y: 450, w: 305, h: 235 },
  sales: { x: 930, y: 350, w: 285, h: 215 },
  product_feedback: { x: 1300, y: 520, w: 320, h: 250 },
  [NONE_ID]: { x: 600, y: 790, w: 350, h: 250 },
};

const NONE_OWNS = "No team owns it, or the model was not confident enough to say.";

export const nodeName = (id: string): string =>
  id === NONE_ID
    ? "Needs triage"
    : id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** The ownership line comes from the roster the classifier was given, so the
 *  card explains the same boundary the model was asked to respect. */
export const nodeOwns = (id: string): string =>
  id === NONE_ID ? NONE_OWNS : (TEAMS[id as TeamId]?.owns ?? NONE_OWNS);

/** The bucket a verdict routes to. decide() returns null for "no confident
 *  team"; on the floor that is a place, so it gets a name. */
export const bucketOf = (team: string | null): NodeId => (team === null ? NONE_ID : (team as NodeId));
