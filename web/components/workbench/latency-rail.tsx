"use client";

import { summarise } from "@/lib/latency";
import { Counter } from "./counter";

type RailProps = {
  /** one entry per ticket that has come back from a live run */
  samples: readonly number[];
  /** wall clock of the whole run, in ms; null while no run has finished */
  wallMs: number | null;
  total: number;
  /** the model these numbers came from; null until a run has answered */
  model: string | null;
};

/**
 * The only page-level statistic, and the reason the developer panel exists. No
 * accuracy metrics: evalset.csv has zero labelled rows, so exact match and
 * routing accuracy cannot be computed from anything real.
 *
 * The model identifier lives here rather than in the title, because it
 * qualifies these numbers and nothing else on the page.
 */
export function LatencyRail({ samples, wallMs, total, model }: RailProps) {
  const stats = summarise(samples);

  return (
    <section aria-labelledby="latency-heading" className="min-w-0">
      <h2 id="latency-heading" className="cap m-0 mb-1.5 text-ink-3">
        Model latency
      </h2>

      <p className="num m-0 mb-1.5 text-[10.5px] text-ink-2">
        <span className="text-ink-3">model </span>
        {model ?? "no run yet"}
      </p>

      {stats === null ? (
        <p className="m-0 text-[11px] text-ink-3">
          No live run yet. Start fans {total} requests out through a bounded pool.
        </p>
      ) : (
        <>
          <dl className="num m-0 flex flex-wrap gap-x-4 gap-y-0.5 text-[10.5px] text-ink-3">
            <div className="flex items-baseline gap-1.5">
              <dt>p50</dt>
              <dd className="m-0 text-[12.5px] font-medium text-ink">
                <Counter value={stats.p50} places={0} suffix=" ms" />
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt>p95</dt>
              <dd className="m-0 text-[12.5px] font-medium text-ink">
                <Counter value={stats.p95} places={0} suffix=" ms" />
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt>mean</dt>
              <dd className="m-0 text-[12.5px] font-medium text-ink">
                <Counter value={stats.mean} places={0} suffix=" ms" />
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt>wall</dt>
              <dd className="m-0 text-[12.5px] font-medium text-ink">
                {wallMs === null ? "—" : `${(wallMs / 1000).toFixed(1)} s`}
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt>done</dt>
              <dd className="m-0 text-[12.5px] font-medium text-ink">
                {stats.count}/{total}
              </dd>
            </div>
          </dl>

          {/* the tail is what a reader watches; older bars are history */}
          <ul
            className="mt-2 flex h-7 list-none items-end gap-px p-0"
            aria-label={`Per-ticket latency, ${stats.count} samples, longest ${stats.max} ms`}
          >
            {samples.slice(-72).map((value, index) => (
              <li
                key={index}
                title={`${value} ms`}
                style={{ height: "100%", transform: `scaleY(${Math.max(0.06, value / stats.max)})` }}
                className="min-w-px flex-1 origin-bottom rounded-t-[1px] bg-brand opacity-55 motion-safe:transition-transform motion-safe:duration-[--duration-normal] motion-safe:ease-[--ease-out-expo]"
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
