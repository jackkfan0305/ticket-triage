"use client";

import type { Answers } from "../../../src/types";
import { CRITERIA, SCORE_KEYS, SCORE_LABEL, TOP, type ScoreKey } from "@/lib/labels";

type Props = { answers: Answers };

/** Use the distribution mode for criteria; the expected score can be fractional. */
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
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h4 className="text-meta font-normal text-ink-2">
          {SCORE_LABEL[scoreKey]}
        </h4>
        <span className="num ml-auto text-micro text-ink-3">{Math.round(answer.confidence * 100)}% confidence</span>
      </div>

      <p className="mb-3 text-meta text-ink-3">Expected score <span className="num text-ink">{answer.score.toFixed(2)} / {top}</span></p>
      <ul className="flex list-none gap-[3px] p-0">
        {levels.map((level) => {
          const probability = answer.probabilities[String(level)] ?? 0;
          const picked = level === chosen;
          return (
            <li
              key={level}
              className={`relative h-24 flex-1 overflow-hidden rounded border-[1.5px] bg-track ${
                picked ? "border-ink" : "border-transparent"
              }`}
              title={`level ${level} · p=${probability.toFixed(2)}`}
            >
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 top-0 bottom-5 block origin-bottom motion-safe:transition-transform motion-safe:duration-[--duration-normal] motion-safe:ease-[--ease-out-expo] ${picked ? "bg-ink-2" : "bg-ink-3"}`}
                style={{ transform: `scaleY(${probability})` }}
              />
              <span
                className={`num absolute inset-x-0 bottom-0 grid h-5 place-items-center bg-track text-micro ${
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

      <p className="mt-3 max-w-[var(--measure)] border-l-2 border-line pl-2 text-meta leading-relaxed text-ink-3">
        <span className="num text-ink-2">Most likely: {chosen}</span> {criteria[chosen]}
      </p>
    </div>
  );
}

export function EvidenceScores({ answers }: Props) {
  return (
    <section className="mb-7">
      <h3 className="mb-5 flex flex-wrap items-baseline gap-2 text-heading font-medium text-balance">
        Scored judgments
        <span className="text-micro font-light tracking-normal normal-case text-ink-3">
          Probability by severity level
        </span>
      </h3>
      <div className="grid gap-8 lg:grid-cols-3">
        {SCORE_KEYS.map((key) => (
          <ScoreBlock key={key} scoreKey={key} answers={answers} />
        ))}
      </div>
    </section>
  );
}
