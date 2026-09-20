"use client";

import { summarise } from "@/lib/latency";
import { Counter } from "./counter";

type RailProps = {
  /** one entry per ticket that has come back from a live run */
  samples: readonly number[];
  /** wall clock of the whole run, in ms; null while no run has finished */
  wallMs: number | null;
  total: number;
};

/**
 * The only page-level statistic. No accuracy metrics: evalset.csv has zero
 * labelled rows, so exact match and routing accuracy cannot be computed from
 * anything real.
 */
export function LatencyRail({ samples, wallMs, total }: RailProps) {
  const stats = summarise(samples);

  return (
    <section aria-labelledby="latency-heading" className="border-b border-line-soft py-3.5">
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5">
        <h2 id="latency-heading" className="cap m-0 text-ink-2">
          Latency
        </h2>
        {stats === null ? (
          <p className="m-0 text-[11.5px] text-ink-3">
            No live run yet. Select Run live to fan out {total} requests through a bounded pool.
          </p>
        ) : (
          <dl className="m-0 flex flex-wrap gap-x-4 gap-y-1 num text-[11px] text-ink-3">
            <div className="flex gap-1.5">
              <dt>p50</dt>
              <dd className="m-0 font-medium text-ink">
                <Counter value={stats.p50} places={0} suffix=" ms" />
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt>p95</dt>
              <dd className="m-0 font-medium text-ink">
                <Counter value={stats.p95} places={0} suffix=" ms" />
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt>mean</dt>
              <dd className="m-0 font-medium text-ink">
                <Counter value={stats.mean} places={0} suffix=" ms" />
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt>wall</dt>
              <dd className="m-0 font-medium text-ink">{wallMs === null ? "—" : `${wallMs} ms`}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>done</dt>
              <dd className="m-0 font-medium text-ink">
                {stats.count}/{total}
              </dd>
            </div>
          </dl>
        )}
      </div>

      {stats !== null && (
        <ul
          className="mt-2.5 flex h-8 list-none items-end gap-[2px] p-0"
          aria-label={`Per-ticket latency, ${stats.count} samples, longest ${stats.max} ms`}
        >
          {samples.map((value, index) => (
            <li
              key={index}
              title={`${value} ms`}
              style={{ height: "100%", transform: `scaleY(${Math.max(0.06, value / stats.max)})` }}
              className="min-w-[2px] flex-1 origin-bottom rounded-t-[1px] bg-brand opacity-55 motion-safe:transition-transform motion-safe:duration-[--duration-normal] motion-safe:ease-[--ease-out-expo]"
            />
          ))}
        </ul>
      )}
    </section>
  );
}
