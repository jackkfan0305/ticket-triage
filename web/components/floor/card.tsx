"use client";

import type { Priority } from "../../../src/types";
import type { Row, Verdict } from "@/lib/rows";
import { PRIORITY_STRIPE } from "../workbench/priority";
import { INBOX_ID, NONE_ID, nodeName, nodeOwns, type Box } from "./layout";

/** Heaviest first, so the bar reads as a severity profile left to right. */
export const MIX_ORDER: readonly Priority[] = ["urgent", "high", "normal", "low"];

/**
 * A card's lists show what is in the pile; the sheet is still where a ticket is
 * opened from, and pressing anywhere on a card opens it.
 *
 * Each list holds everything in its pile and scrolls. `data-scroll` is what the
 * floor looks for: a press or a wheel inside one scrolls the pile instead of
 * dragging the card or zooming the camera.
 */
const PANE =
  "m-0 min-h-0 flex-1 list-none overflow-y-auto overscroll-contain outline-none focus-visible:-outline-offset-2";

export type Arrival = { row: Row; verdict: Verdict };

type ShellProps = {
  id: string;
  box: Box;
  register: (id: string, el: HTMLElement | null) => void;
  labelledBy: string;
  className?: string;
  children: React.ReactNode;
};

/**
 * The body of every card on the floor. Position comes from the frame loop as a
 * GSAP transform, never from layout, so a drag never reflows the page.
 */
function Shell({ id, box, register, labelledBy, className = "", children }: ShellProps) {
  return (
    <section
      data-card={id}
      aria-labelledby={labelledBy}
      ref={(el) => register(id, el)}
      style={{ width: box.w, height: box.h, willChange: "transform" }}
      className={`card no-select absolute top-0 left-0 z-[2] flex touch-none cursor-grab flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-sm transition-shadow duration-[--duration-fast] data-[held=true]:z-[3] data-[held=true]:cursor-grabbing data-[held=true]:shadow-xl ${className}`}
    >
      {children}
    </section>
  );
}

function Count({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`num ml-auto inline-flex h-7 min-w-8 flex-none items-center justify-center rounded-full bg-panel-2 px-2.5 text-[15px] leading-none font-semibold ${className}`}
    >
      {children}
    </span>
  );
}

function NameButton({ id, onOpen, children }: { id: string; onOpen: (id: string) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(id)}
      className="block max-w-full truncate text-[13px] font-medium tracking-[-0.005em] underline decoration-transparent underline-offset-[3px] transition-[text-decoration-color] duration-[--duration-fast] hover:decoration-ink-3"
    >
      {children}
    </button>
  );
}

type TeamCardProps = {
  id: string;
  box: Box;
  arrivals: readonly Arrival[];
  register: (id: string, el: HTMLElement | null) => void;
  onOpenScope: (id: string) => void;
};

export function TeamCard({ id, box, arrivals, register, onOpenScope }: TeamCardProps) {
  const heading = `node-${id}-heading`;
  const mix = MIX_ORDER.map((priority) => arrivals.filter((a) => a.verdict.priority === priority).length);
  const recent = [...arrivals].reverse();
  const holdingPen = id === NONE_ID;

  return (
    <Shell
      id={id}
      box={box}
      register={register}
      labelledBy={heading}
      className={
        holdingPen
          ? "border-dashed bg-[repeating-linear-gradient(135deg,var(--panel-2)_0_7px,transparent_7px_14px)] shadow-none"
          : ""
      }
    >
      <div className="flex flex-none items-center gap-2 px-3.5 pt-3">
        <h2 id={heading} className="m-0 min-w-0 text-[13px] font-medium">
          <NameButton id={id} onOpen={onOpenScope}>
            {nodeName(id)}
          </NameButton>
        </h2>
        <Count>{arrivals.length}</Count>
      </div>

      <p className="m-0 mx-3.5 mt-1 mb-2 line-clamp-2 text-[10.5px] leading-[1.32] text-ink-3">
        {nodeOwns(id)}
      </p>

      <div
        role="img"
        aria-label={`${arrivals.length} tickets: ${MIX_ORDER.map((p, i) => `${mix[i]} ${p}`).join(", ")}`}
        className="mx-3.5 flex h-[3px] flex-none gap-px overflow-hidden rounded-sm bg-track"
      >
        {MIX_ORDER.map((priority, index) => (
          <i
            key={priority}
            style={{ flexGrow: mix[index] }}
            className={`block motion-safe:transition-[flex-grow] motion-safe:duration-[--duration-normal] motion-safe:ease-[--ease-out-expo] ${PRIORITY_STRIPE[priority]}`}
          />
        ))}
      </div>

      <ul
        data-scroll="true"
        tabIndex={0}
        aria-label={`Tickets routed to ${nodeName(id)}`}
        className={`${PANE} mt-2 flex flex-col gap-[3px] px-3.5 pb-3`}
      >
        {recent.map(({ row, verdict }) => (
          <li
            key={row.id}
            title={`${row.id} · ${verdict.priority} · urgency ${verdict.urgency.toFixed(3)}`}
            className="flex flex-none items-center gap-[7px] rounded-full bg-panel-2 px-2 py-[3px] text-[11px] text-ink-2"
          >
            <i
              aria-hidden="true"
              className={`size-[5px] flex-none rounded-full ${PRIORITY_STRIPE[verdict.priority]}`}
            />
            <span className="min-w-0 flex-1 truncate">{row.subject || "(untitled)"}</span>
            <span className="num flex-none text-[9.5px] text-ink-3">{verdict.urgency.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

type InboxCardProps = {
  box: Box;
  waiting: readonly Row[];
  register: (id: string, el: HTMLElement | null) => void;
  onOpenScope: (id: string) => void;
  poolSize: number;
};

export function InboxCard({ box, waiting, register, onOpenScope, poolSize }: InboxCardProps) {
  const heading = "node-inbox-heading";

  return (
    <Shell id={INBOX_ID} box={box} register={register} labelledBy={heading}>
      <div className="flex flex-none items-center gap-2 px-3.5 pt-3">
        <h2 id={heading} className="m-0 min-w-0 text-[13px] font-medium">
          <NameButton id={INBOX_ID} onOpen={onOpenScope}>
            Unrouted inbox
          </NameButton>
        </h2>
        <Count className="bg-brand-soft text-brand">{waiting.length}</Count>
      </div>

      <p className="m-0 mx-3.5 mt-1 mb-2 text-[10.5px] leading-[1.32] text-ink-3">
        Every ticket lands here first. {poolSize} go to the model at a time.
      </p>

      <ul
        data-scroll="true"
        tabIndex={0}
        aria-label="Tickets waiting to be classified"
        className={`${PANE} mt-1 block px-2.5 pb-3`}
      >
        {waiting.map((row) => (
          <li
            key={row.id}
            className={`mb-[5px] overflow-hidden rounded-[10px] border border-line-soft border-l-[3px] px-2.5 py-[7px] ${
              row.pending ? "border-l-brand bg-brand-soft" : "border-l-track bg-panel"
            }`}
          >
            <span className="num block text-[9.5px] tracking-[0.03em] text-ink-3">
              {row.id}
              {row.pending && <span className="font-medium text-brand"> · asking the model</span>}
            </span>
            <span className="mt-px line-clamp-2 text-[12px] leading-[1.32] text-ink">
              {row.subject || "(untitled)"}
            </span>
          </li>
        ))}
      </ul>

      {waiting.length === 0 && (
        <p className="num m-0 flex-none px-3.5 pt-2 pb-3 text-[10px] tracking-[0.06em] uppercase text-ink-3">
          inbox clear
        </p>
      )}

      {/* the mouth every route leaves from, so the wiring has a visible origin */}
      <span
        aria-hidden="true"
        className="absolute top-1/2 right-0 h-14 w-[5px] -translate-y-1/2 rounded-l-md bg-brand opacity-55"
      />
    </Shell>
  );
}
