"use client";

import type { Answers } from "../../../src/types";
import { CRITERIA, SCORE_KEYS, SCORE_LABEL, TOP, type ScoreKey } from "@/lib/labels";

type Props = { answers: Answers };

/** The top two levels of any score are the ones that push a ticket up a band. */
function levelTone(level: number, top: number): string {
  if (level >= top - 1) return "bg-p-urgent";
  if (level >= top - 2) return "bg-p-high";
  return "bg-p-normal";
}

/**
 * `score` is an expected value across the levels, so it is usually fractional
 * (2.99, 1.51) and never equals a level index. The level the model actually
 * chose is the one carrying the most probability.
 */
function modalLevel(probabilities: Record<string, number>, top: number): number {
  let best = 0;
  for (let level = 1; level <= top; level += 1) {
    if ((probabilities[String(level)] ?? 0) > (probabilities[String(best)] ?? 0)) best = level;
  }
  return best;
}

function ScoreBlock({ scoreKey, answers }: { scoreKey: ScoreKey; answers: Answers }) {
  const answer = answers[scoreKey];
  const top = TOP[scoreKey];
  const criteria = CRITERIA[scoreKey];
  const levels = Array.from({ length: top + 1 }, (_, i) => i);
  const chosen = modalLevel(answer.probabilities, top);

  return (
    <div className="mb-5">
      <div className="mb-1.5 flex items-baseline gap-2">
        <h4 className="text-xs font-normal text-ink-2">
          {SCORE_LABEL[scoreKey]} · level {answer.score} of {top}
        </h4>
        <span className="num ml-auto text-[11px] text-ink-3">confidence {answer.confidence.toFixed(2)}</span>
      </div>

      <ul className="flex list-none gap-[3px] p-0">
        {levels.map((level) => {
          const probability = answer.probabilities[String(level)] ?? 0;
          const picked = level === chosen;
          return (
            <li
              key={level}
              className={`relative h-7 flex-1 overflow-hidden rounded border-[1.5px] bg-track ${
                picked ? "border-ink" : "border-transparent"
              }`}
              title={`level ${level} · p=${probability.toFixed(2)}`}
            >
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 bottom-0 block origin-bottom opacity-55 motion-safe:transition-transform motion-safe:duration-[--duration-normal] motion-safe:ease-[--ease-out-expo] ${levelTone(level, top)}`}
                style={{ height: "100%", transform: `scaleY(${probability})` }}
              />
              <span
                className={`num absolute inset-0 grid place-items-center text-[11px] ${
                  picked ? "font-medium text-ink" : "text-ink-2"
                }`}
              >
                {level}
                <span className="sr-only">
                  {` probability ${probability.toFixed(2)}${picked ? ", chosen" : ""}`}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-1.5 max-w-[var(--measure)] border-l-2 border-line pl-2 text-[11.5px] leading-relaxed text-ink-3">
        <span className="num text-ink-2">level {chosen}</span> {criteria[chosen]}
      </p>
    </div>
  );
}

export function EvidenceScores({ answers }: Props) {
  return (
    <section className="mb-7">
      <h3 className="cap mb-3 flex items-baseline gap-2 text-ink-3">
        Scored judgments
        <span className="text-[11px] font-light tracking-normal normal-case text-ink-3">
          bar height = probability of that level
        </span>
      </h3>
      {SCORE_KEYS.map((key) => (
        <ScoreBlock key={key} scoreKey={key} answers={answers} />
      ))}
    </section>
  );
}
