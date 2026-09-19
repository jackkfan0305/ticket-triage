# Ticket Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI and an offline eval harness that turn a support ticket into a priority and an owning team by asking Jev seven narrow questions and applying a pure, tunable policy.

**Architecture:** `run.ts` sends one `POST /v1/systemone` request per ticket carrying all seven questions and validates the answers with zod. `policy.ts` is a pure function from answers to a `TriageDecision`. `eval.ts` caches raw answers per ticket in `tests/fixtures/answers.json`, so policy tuning and the `--sweep` loop run offline with no further inference.

**Tech Stack:** Bun 1.3 (runs TypeScript directly, built-in test runner, loads `.env` automatically), TypeScript 7, `@typesafe-ai/sdk` 0.6.0, zod 4, csv-parse 7. One Python script run through `uv run --with datasets`.

**Spec:** `docs/superpowers/specs/2026-09-18-ticket-triage-design.md`. Read it before starting. The plan implements it and argues from it.

## Global Constraints

- The only secret is `TYPESAFE_API_KEY`, read from `.env` (gitignored). Never commit it, never print it.
- `Priority` values are exactly `"low" | "normal" | "high" | "urgent"`.
- `policy.ts` performs no I/O. It imports only types and `QUESTIONS`, so a browser can later re-run `decide()`.
- Nothing in `questions.ts` or `policy.ts` refers to Zendesk.
- `TriageDecision.evidence` keeps the complete raw Jev answers. Answer schemas use `z.looseObject` so unknown fields survive.
- Every number in `DEFAULT_PARAMS` is a starting guess until Task 7. A number still unchanged after Task 7 without a recorded reason is a bug.
- `scripts/build_evalset.py` is the only Python file. No `pyproject.toml`.
- The dataset's `priority` and `queue` are sampling strata only, never ground truth.
- Commit messages use conventional commits (`feat:`, `test:`, `chore:`, `docs:`).

## Decisions this plan makes that the spec left open

1. **Runtime is Bun.** It runs `.ts` with no build step, ships a test runner, and loads `.env` itself. That avoids adding tsx, vitest, and dotenv.
2. **The TypeSafe SDK plus zod.** The SDK handles auth and retries 408/429/5xx with backoff. Its answer types exist only at compile time, so zod still validates the response at runtime, as Section 3 of the spec requires.
3. **Ticket ids are `hf-<row index>`.** The dataset has no id column, and the row index in the `train` split is stable.
4. **Cache entries store the resolved model** (`{ model, answers }`). `jev-latest` resolved to `jev-1.13.0` on 2026-09-19. An alias bump would otherwise silently change the evidence.
5. **The junk gate also emits `jev-p-low`.** The spec's "Tags emitted" rule says `jev-p-<priority>` always applies, so the junk gate follows it.
6. **Score normalisation reads level counts from `QUESTIONS`**, not literal `4`/`3`/`3`, so adding a level cannot silently skew urgency.
7. **The sweep runs as two independent loops.** One covers the priority thresholds with frustration weight 0 vs 0.10, which answers open question 2. The other covers the routing floor. Priority and routing do not interact, so one joint grid would only bury the floor's effect.
8. **Two extra metrics:** `noneRecall` (the share of human-labelled `none` tickets left unrouted, which checks the no-match branch) and misroute counts by `expected->got` (which covers the `technical_support`/`onboarding` cell the spec says to watch).
9. **`scripts/metrics.ts` is a separate file**, so the metric arithmetic has a test without importing a script that makes network calls.

## Human checkpoints

- **After Task 2:** the person reviews the roster `not` lines in `src/config/teams.ts` (open question 1), then labels `expected_priority` and `expected_team` in `tests/fixtures/evalset.csv`. Tasks 3 to 6 do not need the labels and can proceed in parallel. A roster edit after Task 4 means re-running `bun run eval --refresh`, because the team criteria are part of the question.
- **Task 7 needs the labels.** Stop before it if they are not done.

## File map

| File | Responsibility | Task |
|---|---|---|
| `package.json`, `tsconfig.json` | deps, scripts, strict TS | 1 |
| `src/config/teams.ts` | team roster, `TeamId`, `TEAM_IDS` | 1 |
| `src/types.ts` | `Ticket`, `Priority`, `TriageDecision`, `AnswersSchema`, `Answers` | 1 |
| `tests/helpers.ts` | `makeAnswers()` fixture builder | 1 |
| `tests/answers.test.ts` | answer schema accepts real shape, rejects bad | 1 |
| `scripts/build_evalset.py` | HF rows to `tests/fixtures/evalset.csv` | 2 |
| `src/triage/questions.ts` | the seven Jev questions | 3 |
| `src/triage/run.ts` | `askJev(ticket)` | 3 |
| `src/cli.ts` | single-ticket CLI | 3, 5 |
| `tests/questions.test.ts` | team criteria match the schema's choices | 3 |
| `scripts/eval.ts` | load CSV, fill cache, print metrics, sweep | 4, 6 |
| `src/triage/policy.ts` | `decide(answers, params)` | 5 |
| `tests/policy.test.ts` | table-driven policy tests | 5 |
| `scripts/metrics.ts` | `computeMetrics(rows)` | 6 |
| `tests/metrics.test.ts` | metric arithmetic | 6 |

Commands used throughout: `bun test`, `bunx tsc --noEmit`.

---

### Task 1: Project scaffold, roster, and boundary types

**Files:**
- Create: `package.json`, `tsconfig.json`, `src/config/teams.ts`, `src/types.ts`, `tests/helpers.ts`, `tests/answers.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `TEAMS` (const object), `type TeamId`, `TEAM_IDS: [TeamId, ...TeamId[]]` from `src/config/teams.ts`
  - `type Ticket = { id: string; subject: string; body: string }`
  - `PRIORITIES = ["low", "normal", "high", "urgent"] as const`, `type Priority`
  - `TEAM_CHOICES` (team ids plus `"none"`), `type TeamChoice`
  - `type TriageDecision = { priority: Priority; team: string | null; tags: string[]; evidence: Record<string, unknown> }`
  - `AnswersSchema` (zod), `type Answers`
  - `makeAnswers(overrides?: AnswerOverrides): Answers` from `tests/helpers.ts`

- [ ] **Step 1: Make `.env` available in the worktree**

`.env` is gitignored, so a fresh worktree does not have it. Copy it from the main checkout:

```bash
cp /Users/jackfan/ticket-triage/.env .env
grep -c '^TYPESAFE_API_KEY=' .env
```

Expected: `1`.

- [ ] **Step 2: Create `package.json` and install**

```json
{
  "name": "ticket-triage",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "triage": "bun src/cli.ts",
    "eval": "bun scripts/eval.ts"
  }
}
```

```bash
bun add @typesafe-ai/sdk@0.6.0 zod@^4.6.5 csv-parse@^7.0.2
bun add -d typescript@^7.0.2 @types/bun
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext"],
    "module": "Preserve",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["bun"]
  },
  "include": ["src", "scripts", "tests"]
}
```

- [ ] **Step 4: Create `src/config/teams.ts`**

The roster is copied verbatim from spec Section 2. The `not` lines are guesses awaiting human review (open question 1).

```ts
export const TEAMS = {
  billing: {
    owns: "Invoices, charges, refunds, failed payments, plan and seat changes, tax documents.",
    not: "Pricing questions from someone who has not bought yet; that is sales.",
    zendeskGroupId: null,
  },
  technical_support: {
    owns: "The product is broken or behaving wrongly: errors, crashes, failing integrations, bad or missing data, outages.",
    not: "The product works as designed and the customer does not know how to use it; that is onboarding.",
    zendeskGroupId: null,
  },
  account_access: {
    owns: "Login failures, SSO and MFA, password resets, permissions and roles, adding or removing users.",
    not: "Adding seats because they want to buy more; that is billing.",
    zendeskGroupId: null,
  },
  onboarding: {
    owns: "How do I questions, setup and configuration guidance, requests for documentation or training.",
    not: "The customer followed the documentation and it failed; that is technical support.",
    zendeskGroupId: null,
  },
  sales: {
    owns: "Pricing, quotes, upgrades, renewals, trial extensions, questions from prospects who are not customers yet.",
    not: "A customer disputing a charge they already paid; that is billing.",
    zendeskGroupId: null,
  },
  product_feedback: {
    owns: "Feature requests, roadmap questions, complaints about intended behaviour the customer dislikes.",
    not: "Anything the customer needs resolved today.",
    zendeskGroupId: null,
  },
} as const;

export type TeamId = keyof typeof TEAMS;

export const TEAM_IDS = Object.keys(TEAMS) as [TeamId, ...TeamId[]];
```

- [ ] **Step 5: Write the failing schema test**

Create `tests/helpers.ts`:

```ts
import type { Answers, TeamChoice } from "../src/types";

export type AnswerOverrides = {
  hasRequest?: number;
  security?: number;
  outage?: number;
  impact?: number;
  time?: number;
  frustration?: number;
  team?: TeamChoice;
  teamConfidence?: number;
};

const noul = (value: number) => ({ type: "noul" as const, noul: value });
const score = (value: number) => ({
  type: "score" as const,
  score: value,
  confidence: 0.9,
  legend: {},
  probabilities: {},
});

// Defaults describe a real, calm, low-impact billing request, so each test
// overrides only the signal it is about.
export function makeAnswers(o: AnswerOverrides = {}): Answers {
  return {
    has_request: noul(o.hasRequest ?? 0.95),
    is_security_or_data_loss: noul(o.security ?? 0.05),
    is_outage: noul(o.outage ?? 0.05),
    impact_severity: score(o.impact ?? 0),
    time_pressure: score(o.time ?? 0),
    customer_frustration: score(o.frustration ?? 0),
    team: {
      type: "choice",
      choice: o.team ?? "billing",
      confidence: o.teamConfidence ?? 0.9,
      probabilities: {},
    },
  };
}
```

Create `tests/answers.test.ts`. The first fixture is shaped like the live response captured on 2026-09-19:

```ts
import { describe, expect, test } from "bun:test";
import { AnswersSchema } from "../src/types";
import { makeAnswers } from "./helpers";

const live = {
  has_request: { type: "noul", noul: 0.86 },
  is_security_or_data_loss: { type: "noul", noul: 0.02 },
  is_outage: { type: "noul", noul: 0.04 },
  impact_severity: {
    type: "score",
    score: 2.7,
    confidence: 0.81,
    legend: { "0": "a", "1": "b", "2": "c", "3": "d", "4": "e" },
    probabilities: { "0": 0, "1": 0.05, "2": 0.2, "3": 0.75, "4": 0 },
  },
  time_pressure: { type: "score", score: 1, confidence: 0.9, legend: {}, probabilities: {} },
  customer_frustration: { type: "score", score: 0.4, confidence: 0.7, legend: {}, probabilities: {} },
  team: {
    type: "choice",
    choice: "account_access",
    confidence: 0.99,
    probabilities: { account_access: 0.99, none: 0.01 },
  },
};

describe("AnswersSchema", () => {
  test("accepts a response shaped like the live API", () => {
    expect(AnswersSchema.parse(live).team.choice).toBe("account_access");
  });

  test("keeps fields it does not know about, so evidence stays complete", () => {
    const withExtra = { ...live, team: { ...live.team, rationale_v2: "x" } };
    expect(AnswersSchema.parse(withExtra).team).toHaveProperty("rationale_v2", "x");
  });

  test("accepts the test fixture builder's output", () => {
    expect(() => AnswersSchema.parse(makeAnswers())).not.toThrow();
  });

  test.each([
    ["a missing question", (a: Record<string, unknown>) => ({ ...a, team: undefined })],
    ["a team outside the roster", (a: Record<string, unknown>) => ({ ...a, team: { ...live.team, choice: "legal" } })],
    ["a noul above 1", (a: Record<string, unknown>) => ({ ...a, is_outage: { type: "noul", noul: 1.2 } })],
    ["a score above its top level", (a: Record<string, unknown>) => ({ ...a, time_pressure: { ...live.time_pressure, score: 3.5 } })],
    ["a wrong answer type", (a: Record<string, unknown>) => ({ ...a, has_request: live.impact_severity })],
  ])("rejects %s", (_name, mutate) => {
    expect(() => AnswersSchema.parse(mutate(live))).toThrow();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `bun test tests/answers.test.ts`
Expected: FAIL, cannot resolve `../src/types`.

- [ ] **Step 7: Create `src/types.ts`**

```ts
import { z } from "zod";
import { TEAM_IDS } from "./config/teams";

export type Ticket = {
  id: string;
  subject: string;
  body: string;
};

// Zendesk's own four values, so the deferred writer is a field copy.
export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TEAM_CHOICES = [...TEAM_IDS, "none"] as const;
export type TeamChoice = (typeof TEAM_CHOICES)[number];

export type TriageDecision = {
  priority: Priority;
  team: string | null; // null means no confident match
  tags: string[];
  evidence: Record<string, unknown>; // raw Jev answers, kept for audit and tuning
};

const probability = z.number().min(0).max(1);

// looseObject everywhere: unknown fields pass through, so evidence stays complete.
const noulAnswer = z.looseObject({ type: z.literal("noul"), noul: probability });

const scoreAnswer = (levels: number) =>
  z.looseObject({
    type: z.literal("score"),
    score: z.number().min(0).max(levels - 1),
    confidence: probability,
    probabilities: z.record(z.string(), probability),
  });

const teamAnswer = z.looseObject({
  type: z.literal("choice"),
  choice: z.enum(TEAM_CHOICES),
  confidence: probability,
  probabilities: z.record(z.string(), probability),
});

export const AnswersSchema = z.looseObject({
  has_request: noulAnswer,
  is_security_or_data_loss: noulAnswer,
  is_outage: noulAnswer,
  impact_severity: scoreAnswer(5),
  time_pressure: scoreAnswer(4),
  customer_frustration: scoreAnswer(4),
  team: teamAnswer,
});

export type Answers = z.infer<typeof AnswersSchema>;
```

- [ ] **Step 8: Run tests and type-check**

Run: `bun test && bunx tsc --noEmit`
Expected: 8 tests pass, tsc prints nothing.

- [ ] **Step 9: Commit**

```bash
git add package.json bun.lock tsconfig.json src tests
git commit -m "feat: add roster, boundary types, and Jev answer schema"
```

---

### Task 2: Build the eval set

**Files:**
- Create: `scripts/build_evalset.py`
- Create (generated): `tests/fixtures/evalset.csv`

**Interfaces:**
- Consumes: nothing.
- Produces: `tests/fixtures/evalset.csv` with header `id,subject,body,src_priority,src_queue,expected_priority,expected_team`. `expected_*` are blank until a person fills them in. Task 4 reads this file.

- [ ] **Step 1: Write `scripts/build_evalset.py`**

```python
"""Sample 60 English tickets into tests/fixtures/evalset.csv for hand labelling.

Source: Tobi-Bueck/customer-support-tickets on Hugging Face, CC-BY-NC-4.0.
Run once: uv run --with datasets scripts/build_evalset.py

The dataset's priority and queue columns are sampling strata only. They are
copied as src_priority and src_queue for reference, never used as labels.
"""

import csv
import random
import sys
from collections import Counter
from pathlib import Path

from datasets import load_dataset

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "evalset.csv"
SEED = 7
PRIORITIES = ["critical", "high", "medium", "low", "very_low"]
PER_PRIORITY = 11
MAX_PER_QUEUE = 2  # within one priority, so a big queue cannot crowd out the rest
HR_QUEUE = "Human Resources"
HR_COUNT = 5  # outside any SaaS roster: the only way to exercise the no-match branch
FIELDS = ["id", "subject", "body", "src_priority", "src_queue", "expected_priority", "expected_team"]


def pick_for_priority(rows, priority, rng):
    pool = [r for r in rows if r["priority"] == priority]
    rng.shuffle(pool)
    per_queue = Counter()
    chosen = []
    for r in pool:
        if per_queue[r["queue"]] < MAX_PER_QUEUE:
            per_queue[r["queue"]] += 1
            chosen.append(r)
        if len(chosen) == PER_PRIORITY:
            return chosen
    sys.exit(f"only {len(chosen)} usable rows for priority {priority}")


def sample(rows, rng):
    hr = rng.sample([r for r in rows if r["queue"] == HR_QUEUE], HR_COUNT)
    rest = [r for r in rows if r["queue"] != HR_QUEUE]
    return hr + [r for p in PRIORITIES for r in pick_for_priority(rest, p, rng)]


def main():
    if OUT.exists():
        sys.exit(f"{OUT} exists and may hold hand labels. Delete it first to rebuild.")

    ds = load_dataset("Tobi-Bueck/customer-support-tickets", split="train")
    rows = [
        {**r, "id": f"hf-{i}"}
        for i, r in enumerate(ds)
        if r["language"] == "en"
    ]
    picked = sample(rows, random.Random(SEED))

    assert len(picked) == HR_COUNT + PER_PRIORITY * len(PRIORITIES) == 60
    assert len({r["id"] for r in picked}) == 60, "duplicate ticket ids"
    assert sum(r["queue"] == HR_QUEUE for r in picked) == HR_COUNT

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for r in picked:
            w.writerow({
                "id": r["id"],
                "subject": (r["subject"] or "").strip(),
                "body": (r["body"] or "").strip(),
                "src_priority": r["priority"],
                "src_queue": r["queue"],
                "expected_priority": "",
                "expected_team": "",
            })
    print(f"wrote {len(picked)} rows to {OUT}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

Run: `uv run --with datasets scripts/build_evalset.py`
Expected: `wrote 60 rows to .../tests/fixtures/evalset.csv`. The first run downloads the dataset, which takes a minute or two.

- [ ] **Step 3: Check the output**

```bash
bun -e 'import {parse} from "csv-parse/sync"; const r = parse(await Bun.file("tests/fixtures/evalset.csv").text(), {columns:true}); console.log(r.length, Object.groupBy(r, x => x.src_priority).critical?.length, r.filter(x => x.src_queue === "Human Resources").length, r.filter(x => !x.body).length)'
```

Expected: `60 11 5 0` (60 rows, 11 critical, 5 HR, no empty bodies). If any body is empty, look at that row. An empty body is a legitimate junk case, so keep it, but say so in the commit message.

- [ ] **Step 4: Confirm the refuse-to-overwrite guard**

Run: `uv run --with datasets scripts/build_evalset.py; echo "exit $?"`
Expected: the "exists and may hold hand labels" message and `exit 1`.

- [ ] **Step 5: Commit**

```bash
git add scripts/build_evalset.py tests/fixtures/evalset.csv
git commit -m "feat: sample 60-ticket eval set from Hugging Face"
```

- [ ] **Step 6: HUMAN CHECKPOINT (does not block Tasks 3 to 6)**

Hand these instructions to the person:

1. Review the `not` lines in `src/config/teams.ts`. They have to agree with how you will label.
2. In `tests/fixtures/evalset.csv`, fill `expected_priority` (`low`/`normal`/`high`/`urgent`) and `expected_team` (a key of `TEAMS`, or `none`) for every row. Hide `src_priority` and `src_queue` while labelling so the other company's labels do not anchor yours.
3. Commit as `chore: label eval set`.

---

### Task 3: Jev questions, `askJev`, and a raw-answer CLI

**Files:**
- Create: `src/triage/questions.ts`, `src/triage/run.ts`, `src/cli.ts`, `tests/questions.test.ts`

**Interfaces:**
- Consumes: `TEAMS` from `src/config/teams.ts`; `AnswersSchema`, `Answers`, `Ticket`, `TEAM_CHOICES` from `src/types.ts`.
- Produces:
  - `QUESTIONS` (satisfies the SDK's `Questions`), keyed `has_request`, `is_security_or_data_loss`, `is_outage`, `impact_severity`, `time_pressure`, `customer_frustration`, `team`
  - `type JevResult = { model: string; answers: Answers }`
  - `askJev(ticket: Ticket, client?: TypeSafeClient): Promise<JevResult>`, which throws on API failure or on a response that fails `AnswersSchema`

- [ ] **Step 1: Write the failing test**

`tests/questions.test.ts` guards the one invariant that can drift silently: the options Jev is offered must be exactly the options the schema accepts.

```ts
import { expect, test } from "bun:test";
import { QUESTIONS } from "../src/triage/questions";
import { TEAM_CHOICES } from "../src/types";

test("team question offers exactly the choices the answer schema accepts", () => {
  expect(Object.keys(QUESTIONS.team.criteria).sort()).toEqual([...TEAM_CHOICES].sort());
});

test("score questions have the level counts the schema expects", () => {
  expect(QUESTIONS.impact_severity.criteria).toHaveLength(5);
  expect(QUESTIONS.time_pressure.criteria).toHaveLength(4);
  expect(QUESTIONS.customer_frustration.criteria).toHaveLength(4);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test tests/questions.test.ts`
Expected: FAIL, cannot resolve `../src/triage/questions`.

- [ ] **Step 3: Create `src/triage/questions.ts`**

The wording is copied from spec Section 2. State is `{ ticket: { subject, body } }`, so instructions refer to `` `ticket` ``.

```ts
import type { Questions } from "@typesafe-ai/sdk";
import { TEAMS } from "../config/teams";

// Each option carries its own scope and the neighbouring team's, so Jev sees the
// contrast instead of inferring it.
const teamCriteria = {
  ...Object.fromEntries(Object.entries(TEAMS).map(([id, t]) => [id, { owns: t.owns, not: t.not }])),
  none: "No team listed here owns this ticket.",
};

export const QUESTIONS = {
  has_request: {
    type: "noul",
    instructions: "`ticket` contains a genuine request or problem report from a person.",
    criteria: {
      true: "A person is asking for help, asking a question, or reporting a problem.",
      false: "An automated bounce, an out-of-office reply, marketing mail, or an empty message.",
    },
  },
  is_security_or_data_loss: {
    type: "noul",
    instructions:
      "`ticket` reports a security incident, unauthorised access, a data breach, or customer data that has been lost or corrupted.",
  },
  is_outage: {
    type: "noul",
    instructions:
      "`ticket` describes the service being down or unreachable overall, rather than one feature behaving wrongly.",
  },
  impact_severity: {
    type: "score",
    instructions: "How severe is the impact on the customer described in `ticket`?",
    criteria: [
      "Nothing is broken. The message asks a question, gives feedback, or requests something for later.",
      "Something is slower, uglier, or more awkward than it should be, and the customer can still do their work.",
      "A feature the customer needs is broken, and a workaround exists or is implied.",
      "The customer cannot do their work and mentions no workaround.",
      "The customer's whole organisation is blocked, or customer data is lost or corrupted.",
    ],
  },
  time_pressure: {
    type: "score",
    instructions: "How much time pressure does `ticket` express?",
    criteria: [
      "The message refers to no deadline or timeframe at all.",
      "The customer wants this resolved reasonably soon but names no date.",
      "The customer names a deadline some days away, or says the problem is getting worse.",
      "The customer names a deadline today or tomorrow, or says work has already stopped.",
    ],
  },
  customer_frustration: {
    type: "score",
    instructions: "How frustrated is the customer who wrote `ticket`?",
    criteria: [
      "Calm and matter of fact.",
      "Mildly annoyed but polite.",
      "Clearly frustrated; complains about the product or about previous support.",
      "Angry; threatens to cancel, escalate, or make the problem public.",
    ],
  },
  team: {
    type: "choice",
    instructions:
      "Which team should own `ticket`? Each option says what that team owns and what belongs to a neighbouring team instead.",
    criteria: teamCriteria,
  },
} satisfies Questions;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/questions.test.ts`
Expected: 2 pass.

- [ ] **Step 5: Create `src/triage/run.ts`**

```ts
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { AnswersSchema, type Answers, type Ticket } from "../types";
import { QUESTIONS } from "./questions";

export type JevResult = { model: string; answers: Answers };

// One request carries every question; they are independent, so Jev runs them in
// parallel. Throws on API failure (after the SDK's retries) or on a response that
// does not match AnswersSchema, so a shape change never scores as zero.
export async function askJev(ticket: Ticket, client = new TypeSafeClient()): Promise<JevResult> {
  const res = await client.systemOne({
    state: { ticket: { subject: ticket.subject, body: ticket.body } },
    questions: QUESTIONS,
  });
  return { model: res.model, answers: AnswersSchema.parse(res.answers) };
}
```

- [ ] **Step 6: Create `src/cli.ts` (raw answers for now)**

```ts
import { parseArgs } from "node:util";
import { askJev } from "./triage/run";

const USAGE = 'usage: bun src/cli.ts --subject "..." --body "..."';

const { values } = parseArgs({
  options: { subject: { type: "string", default: "" }, body: { type: "string" } },
});

if (!values.body?.trim()) {
  console.error(USAGE);
  process.exit(2);
}

try {
  const result = await askJev({ id: "cli", subject: values.subject, body: values.body });
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(`triage failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
```

- [ ] **Step 7: Type-check**

Run: `bunx tsc --noEmit`
Expected: no output.

- [ ] **Step 8: Hand-check five probe tickets against the live API**

This is spec build step 2: read the **raw answers**, not a decision. Each probe targets one question. Run each one and compare against the expected direction:

```bash
bun src/cli.ts --subject "Out of office" --body "I am out of the office until Monday with limited access to email. For urgent matters please contact my colleague."
bun src/cli.ts --subject "Unusual admin login" --body "Hello, someone signed in to our admin account from another country last night and exported our customer list. We have already reset passwords. Could you advise what else we should do? Thank you."
bun src/cli.ts --subject "Everything is down" --body "Your whole app returns 502 for everyone at our company since 9am. Nobody can work."
bun src/cli.ts --subject "Slack integration" --body "I have spent an hour trying to set up the Slack integration and I cannot work out where the webhook URL goes. This is ridiculous."
bun src/cli.ts --subject "Charged twice" --body "We were charged twice for September on invoice 4471. Please refund the duplicate."
```

| Probe | Expect |
|---|---|
| Out of office | `has_request.noul` low (< 0.3) |
| Admin login | `is_security_or_data_loss.noul` high even though the tone is calm; `customer_frustration` near 0 |
| Everything down | `is_outage.noul` high; `impact_severity` near 4; `time_pressure` near 3 |
| Slack integration | `team` onboarding or technical_support, probably with lower confidence. This is the boundary the spec warns about, so record what came back. |
| Charged twice | `team` billing with high confidence |

If a probe goes the wrong way, reword that question's instructions or criteria in `questions.ts` and re-run that probe. Change wording only, never question ids. Paste the five raw outputs into the commit message body or a PR note, so the baseline is recorded.

- [ ] **Step 9: Commit**

```bash
git add src/triage/questions.ts src/triage/run.ts src/cli.ts tests/questions.test.ts
git commit -m "feat: ask Jev the seven triage questions from a CLI"
```

---

### Task 4: Eval harness, cache half

**Files:**
- Create: `scripts/eval.ts`
- Create (generated): `tests/fixtures/answers.json`

**Interfaces:**
- Consumes: `askJev`, `JevResult` from `src/triage/run.ts`; `AnswersSchema`, `PRIORITIES`, `TEAM_CHOICES` from `src/types.ts`; `tests/fixtures/evalset.csv`.
- Produces: `tests/fixtures/answers.json`, shaped `Record<ticketId, { model: string; answers: Answers }>`. Task 6 extends `scripts/eval.ts` with the functions `loadRows()`, `loadCache()`, `fillCache()` and the type `EvalRow` defined here.

- [ ] **Step 1: Create `scripts/eval.ts`**

```ts
import { parseArgs } from "node:util";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { askJev } from "../src/triage/run";
import { AnswersSchema, PRIORITIES, TEAM_CHOICES } from "../src/types";

const EVALSET = new URL("../tests/fixtures/evalset.csv", import.meta.url);
const CACHE = new URL("../tests/fixtures/answers.json", import.meta.url);

const EvalRowSchema = z.object({
  id: z.string().min(1),
  subject: z.string(),
  body: z.string(),
  src_priority: z.string(),
  src_queue: z.string(),
  expected_priority: z.union([z.enum(PRIORITIES), z.literal("")]),
  expected_team: z.union([z.enum(TEAM_CHOICES), z.literal("")]),
});
type EvalRow = z.infer<typeof EvalRowSchema>;

const CacheSchema = z.record(z.string(), z.object({ model: z.string(), answers: AnswersSchema }));
type Cache = z.infer<typeof CacheSchema>;

async function loadRows(): Promise<EvalRow[]> {
  const records = parse(await Bun.file(EVALSET).text(), { columns: true, skip_empty_lines: true });
  return z.array(EvalRowSchema).parse(records);
}

async function loadCache(): Promise<Cache> {
  const file = Bun.file(CACHE);
  return (await file.exists()) ? CacheSchema.parse(await file.json()) : {};
}

async function fillCache(
  rows: readonly EvalRow[],
  start: Cache,
  refresh: boolean,
): Promise<{ cache: Cache; errored: string[] }> {
  const todo = rows.filter((r) => refresh || !start[r.id]);
  if (todo.length === 0) return { cache: start, errored: [] };

  const client = new TypeSafeClient();
  let cache = start;
  const errored: string[] = [];
  for (const row of todo) {
    try {
      cache = { ...cache, [row.id]: await askJev(row, client) };
      // Written after every ticket so a crash keeps everything already paid for.
      await Bun.write(CACHE, `${JSON.stringify(cache, null, 2)}\n`);
      console.error(`fetched ${row.id}`);
    } catch (err) {
      errored.push(row.id);
      console.error(`${row.id} errored: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { cache, errored };
}

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: { refresh: { type: "boolean", default: false } },
});

const rows = await loadRows();
const { cache, errored } = await fillCache(rows, await loadCache(), values.refresh);
console.log(`${Object.keys(cache).length}/${rows.length} cached, ${errored.length} errored this run`);
if (errored.length > 0) process.exitCode = 1;
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Populate the cache (60 live calls, about 25k input tokens in total)**

Run: `bun run eval`
Expected: 60 `fetched hf-…` lines, then `60/60 cached, 0 errored this run`.

- [ ] **Step 4: Confirm the second run is free**

Run: `bun run eval`
Expected: `60/60 cached, 0 errored this run` immediately, with no `fetched` lines.

- [ ] **Step 5: Commit**

```bash
git add scripts/eval.ts tests/fixtures/answers.json
git commit -m "feat: cache raw Jev answers for the eval set"
```

---

### Task 5: The policy

**Files:**
- Create: `src/triage/policy.ts`, `tests/policy.test.ts`
- Modify: `src/cli.ts` (print the decision)

**Interfaces:**
- Consumes: `Answers`, `Priority`, `TriageDecision` from `src/types.ts`; `QUESTIONS` from `src/triage/questions.ts`; `makeAnswers` from `tests/helpers.ts`.
- Produces:
  - `type PolicyParams = { junkBelow: number; securityAbove: number; outageAbove: number; weights: { impact: number; time: number; frustration: number }; thresholds: { urgent: number; high: number; normal: number }; teamConfidenceFloor: number; frustratedTagAt: number }`
  - `DEFAULT_PARAMS: PolicyParams`
  - `urgency(answers: Answers, weights: PolicyParams["weights"]): number`
  - `decide(answers: Answers, params?: PolicyParams): TriageDecision`

- [ ] **Step 1: Write the failing tests**

Tests pin their own `P`, a copy of the spec's starting guesses, rather than using `DEFAULT_PARAMS`. That way Task 7 can retune the defaults without rewriting tests that describe the policy's shape.

```ts
import { describe, expect, test } from "bun:test";
import { DEFAULT_PARAMS, decide, type PolicyParams } from "../src/triage/policy";
import { type AnswerOverrides, makeAnswers } from "./helpers";

const P: PolicyParams = {
  junkBelow: 0.3,
  securityAbove: 0.7,
  outageAbove: 0.7,
  weights: { impact: 0.6, time: 0.3, frustration: 0.1 },
  thresholds: { urgent: 0.75, high: 0.5, normal: 0.25 },
  teamConfidenceFloor: 0.6,
  frustratedTagAt: 2,
};

const run = (o: AnswerOverrides, p: PolicyParams = P) => decide(makeAnswers(o), p);

describe("gates", () => {
  test("junk wins over every other gate", () => {
    expect(run({ hasRequest: 0.1, security: 0.99, outage: 0.99 })).toMatchObject({
      priority: "low",
      team: null,
      tags: ["jev-triaged", "jev-p-low", "needs-triage", "jev-junk"],
    });
  });

  test("has_request exactly at the floor is not junk", () => {
    expect(run({ hasRequest: 0.3 }).tags).not.toContain("jev-junk");
  });

  test("a calm security report is urgent and still routed", () => {
    expect(run({ security: 0.9 })).toMatchObject({
      priority: "urgent",
      team: "billing",
      tags: ["jev-triaged", "jev-p-urgent", "jev-security"],
    });
  });

  test("security exactly at the gate does not fire", () => {
    expect(run({ security: 0.7 }).priority).toBe("low");
  });

  test("an outage is urgent without a security tag", () => {
    expect(run({ outage: 0.9 })).toMatchObject({ priority: "urgent", tags: ["jev-triaged", "jev-p-urgent"] });
  });
});

describe("weighted urgency", () => {
  test.each([
    [{ impact: 4, time: 3 }, "urgent"], // 0.60 + 0.30
    [{ impact: 3, time: 1 }, "high"], // 0.45 + 0.10
    [{ impact: 2 }, "normal"], // 0.30
    [{ impact: 1 }, "low"], // 0.15
    [{ frustration: 3 }, "low"], // 0.10: shouting alone cannot raise priority
  ] as const)("%o -> %s", (o, priority) => {
    expect(run(o).priority).toBe(priority);
  });

  test.each([
    [3, "urgent"],
    [2, "high"],
    [1, "normal"],
    [0, "low"],
  ] as const)("thresholds are inclusive: impact %d alone at weight 1 -> %s", (impact, priority) => {
    const impactOnly = { ...P, weights: { impact: 1, time: 0, frustration: 0 } };
    expect(run({ impact }, impactOnly).priority).toBe(priority);
  });
});

describe("frustration tag", () => {
  test("tags at the threshold, not below it", () => {
    expect(run({ frustration: 2 }).tags).toContain("jev-frustrated");
    expect(run({ frustration: 1.99 }).tags).not.toContain("jev-frustrated");
  });
});

describe("routing", () => {
  test("none leaves the ticket unrouted", () => {
    expect(run({ team: "none" })).toMatchObject({ team: null, tags: ["jev-triaged", "jev-p-low", "needs-triage"] });
  });

  test("low confidence records the suppressed guess", () => {
    expect(run({ team: "onboarding", teamConfidence: 0.59 })).toMatchObject({
      team: null,
      tags: ["jev-triaged", "jev-p-low", "needs-triage", "jev-guess-onboarding"],
    });
  });

  test("confidence exactly at the floor routes", () => {
    expect(run({ team: "onboarding", teamConfidence: 0.6 }).team).toBe("onboarding");
  });
});

describe("purity and evidence", () => {
  test("evidence is a complete copy of the answers, and the input is untouched", () => {
    const answers = makeAnswers({ impact: 2 });
    const before = structuredClone(answers);
    const decision = decide(answers, P);
    expect(decision.evidence).toEqual(before);
    expect(decision.evidence).not.toBe(answers);
    expect(answers).toEqual(before);
  });

  test("default thresholds are ordered", () => {
    const t = DEFAULT_PARAMS.thresholds;
    expect(t.urgent > t.high && t.high > t.normal).toBe(true);
  });
});
```

Save as `tests/policy.test.ts`.

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/policy.test.ts`
Expected: FAIL, cannot resolve `../src/triage/policy`.

- [ ] **Step 3: Create `src/triage/policy.ts`**

```ts
import type { Answers, Priority, TriageDecision } from "../types";
import { QUESTIONS } from "./questions";

export type PolicyParams = {
  junkBelow: number;
  securityAbove: number;
  outageAbove: number;
  weights: { impact: number; time: number; frustration: number };
  thresholds: { urgent: number; high: number; normal: number };
  teamConfidenceFloor: number;
  frustratedTagAt: number;
};

// Starting guesses from spec Section 3. Task 7 replaces them with swept values.
export const DEFAULT_PARAMS: PolicyParams = {
  junkBelow: 0.3,
  securityAbove: 0.7,
  outageAbove: 0.7,
  weights: { impact: 0.6, time: 0.3, frustration: 0.1 },
  thresholds: { urgent: 0.75, high: 0.5, normal: 0.25 },
  teamConfidenceFloor: 0.6,
  frustratedTagAt: 2,
};

// Normalise each Score to 0..1 by its top level, read from the question itself.
const top = (q: { criteria: readonly unknown[] }) => q.criteria.length - 1;

export function urgency(a: Answers, w: PolicyParams["weights"]): number {
  return (
    (w.impact * a.impact_severity.score) / top(QUESTIONS.impact_severity) +
    (w.time * a.time_pressure.score) / top(QUESTIONS.time_pressure) +
    (w.frustration * a.customer_frustration.score) / top(QUESTIONS.customer_frustration)
  );
}

function band(u: number, t: PolicyParams["thresholds"]): Priority {
  if (u >= t.urgent) return "urgent";
  if (u >= t.high) return "high";
  if (u >= t.normal) return "normal";
  return "low";
}

function route(t: Answers["team"], floor: number): { team: string | null; tags: string[] } {
  if (t.choice === "none") return { team: null, tags: ["needs-triage"] };
  if (t.confidence < floor) return { team: null, tags: ["needs-triage", `jev-guess-${t.choice}`] };
  return { team: t.choice, tags: [] };
}

export function decide(a: Answers, p: PolicyParams = DEFAULT_PARAMS): TriageDecision {
  const evidence = { ...a };
  if (a.has_request.noul < p.junkBelow) {
    return { priority: "low", team: null, tags: ["jev-triaged", "jev-p-low", "needs-triage", "jev-junk"], evidence };
  }

  // Gates are separate conditions, not weights, so a calm security report
  // cannot average itself down.
  const isSecurity = a.is_security_or_data_loss.noul > p.securityAbove;
  const isOutage = a.is_outage.noul > p.outageAbove;
  const priority = isSecurity || isOutage ? "urgent" : band(urgency(a, p.weights), p.thresholds);
  const routing = route(a.team, p.teamConfidenceFloor);

  return {
    priority,
    team: routing.team,
    tags: [
      "jev-triaged",
      `jev-p-${priority}`,
      ...routing.tags,
      ...(isSecurity ? ["jev-security"] : []),
      ...(a.customer_frustration.score >= p.frustratedTagAt ? ["jev-frustrated"] : []),
    ],
    evidence,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `bun test`
Expected: all pass (policy, answers, questions).

- [ ] **Step 5: Make the CLI print the decision**

In `src/cli.ts`, add the import and replace the `console.log` line:

```ts
import { decide } from "./triage/policy";
```

```ts
  const { model, answers } = await askJev({ id: "cli", subject: values.subject, body: values.body });
  console.log(JSON.stringify({ model, decision: decide(answers) }, null, 2));
```

(Replace the line `const result = await askJev(...)` and the `console.log(JSON.stringify(result, null, 2))` line with these two lines.)

- [ ] **Step 6: Verify end to end**

Run: `bunx tsc --noEmit && bun src/cli.ts --subject "Everything is down" --body "Your whole app returns 502 for everyone at our company since 9am. Nobody can work."`
Expected: tsc silent; the decision has `"priority": "urgent"`, `team` set to `technical_support` or null, and `evidence` holds all seven answers.

- [ ] **Step 7: Commit**

```bash
git add src/triage/policy.ts tests/policy.test.ts src/cli.ts
git commit -m "feat: add pure triage policy with gates and weighted urgency"
```

---

### Task 6: Metrics and `--sweep`

**Files:**
- Create: `scripts/metrics.ts`, `tests/metrics.test.ts`
- Modify: `scripts/eval.ts`

**Interfaces:**
- Consumes: `decide`, `DEFAULT_PARAMS`, `PolicyParams` from `src/triage/policy.ts`; `PRIORITIES`, `Priority`, `TeamChoice`, `TriageDecision` from `src/types.ts`; `loadRows`, `loadCache`, `fillCache`, `EvalRow` from Task 4's `scripts/eval.ts`.
- Produces:
  - `type Scored = { expectedPriority: Priority; expectedTeam: TeamChoice; decision: TriageDecision }`
  - `type Metrics = { n: number; priorityExact: number | null; priorityWithinOne: number | null; urgentRecall: number | null; routingAccuracy: number | null; needsTriageRate: number | null; noneRecall: number | null; misroutes: Record<string, number> }`
  - `computeMetrics(rows: readonly Scored[]): Metrics`
  - CLI flag `bun run eval --sweep`

- [ ] **Step 1: Write the failing test**

`tests/metrics.test.ts`:

```ts
import { expect, test } from "bun:test";
import { computeMetrics, type Scored } from "../scripts/metrics";
import type { Priority, TeamChoice } from "../src/types";

const row = (expectedPriority: Priority, expectedTeam: TeamChoice, priority: Priority, team: string | null): Scored => ({
  expectedPriority,
  expectedTeam,
  decision: { priority, team, tags: [], evidence: {} },
});

test("computes every metric over a small mixed set", () => {
  const m = computeMetrics([
    row("urgent", "billing", "urgent", "billing"), // exact, routed right
    row("urgent", "technical_support", "high", "onboarding"), // within one, misrouted
    row("normal", "none", "normal", null), // exact, correctly unrouted
    row("low", "sales", "urgent", null), // three bands off, unrouted
  ]);
  expect(m).toEqual({
    n: 4,
    priorityExact: 0.5,
    priorityWithinOne: 0.75,
    urgentRecall: 0.5,
    routingAccuracy: 0.5,
    needsTriageRate: 0.5,
    noneRecall: 1,
    misroutes: { "technical_support->onboarding": 1 },
  });
});

test("routing a ticket labelled none counts as a misroute", () => {
  expect(computeMetrics([row("low", "none", "low", "billing")]).misroutes).toEqual({ "none->billing": 1 });
});

test("empty input gives null rates rather than NaN", () => {
  expect(computeMetrics([])).toEqual({
    n: 0,
    priorityExact: null,
    priorityWithinOne: null,
    urgentRecall: null,
    routingAccuracy: null,
    needsTriageRate: null,
    noneRecall: null,
    misroutes: {},
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/metrics.test.ts`
Expected: FAIL, cannot resolve `../scripts/metrics`.

- [ ] **Step 3: Create `scripts/metrics.ts`**

```ts
import { PRIORITIES, type Priority, type TeamChoice, type TriageDecision } from "../src/types";

export type Scored = { expectedPriority: Priority; expectedTeam: TeamChoice; decision: TriageDecision };

export type Metrics = {
  n: number;
  priorityExact: number | null;
  priorityWithinOne: number | null;
  urgentRecall: number | null; // weighted above the rest: a missed urgent costs a customer
  routingAccuracy: number | null; // over routed tickets only
  needsTriageRate: number | null;
  noneRecall: number | null; // did the no-match branch fire when it should
  misroutes: Record<string, number>; // "expected->got"
};

const rate = (hits: number, total: number): number | null => (total === 0 ? null : hits / total);
const rank = (p: Priority): number => PRIORITIES.indexOf(p);

export function computeMetrics(rows: readonly Scored[]): Metrics {
  const urgent = rows.filter((r) => r.expectedPriority === "urgent");
  const routed = rows.filter((r) => r.decision.team !== null);
  const none = rows.filter((r) => r.expectedTeam === "none");
  const wrong = routed.filter((r) => r.decision.team !== r.expectedTeam);
  const grouped = Object.groupBy(wrong, (r) => `${r.expectedTeam}->${r.decision.team}`);

  return {
    n: rows.length,
    priorityExact: rate(rows.filter((r) => r.decision.priority === r.expectedPriority).length, rows.length),
    priorityWithinOne: rate(
      rows.filter((r) => Math.abs(rank(r.decision.priority) - rank(r.expectedPriority)) <= 1).length,
      rows.length,
    ),
    urgentRecall: rate(urgent.filter((r) => r.decision.priority === "urgent").length, urgent.length),
    routingAccuracy: rate(routed.length - wrong.length, routed.length),
    needsTriageRate: rate(rows.length - routed.length, rows.length),
    noneRecall: rate(none.filter((r) => r.decision.team === null).length, none.length),
    misroutes: Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v?.length ?? 0])),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `bun test`
Expected: all pass.

- [ ] **Step 5: Add scoring and the sweep to `scripts/eval.ts`**

Add these imports at the top:

```ts
import { computeMetrics, type Metrics, type Scored } from "./metrics";
import { DEFAULT_PARAMS, decide, type PolicyParams } from "../src/triage/policy";
```

Add these functions below `fillCache`:

```ts
function score(rows: readonly EvalRow[], cache: Cache, params: PolicyParams): Scored[] {
  return rows.flatMap((r) => {
    const hit = cache[r.id];
    if (!hit || r.expected_priority === "" || r.expected_team === "") return [];
    return [{ expectedPriority: r.expected_priority, expectedTeam: r.expected_team, decision: decide(hit.answers, params) }];
  });
}

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

function summary(m: Metrics) {
  return {
    urgentRecall: pct(m.urgentRecall),
    exact: pct(m.priorityExact),
    withinOne: pct(m.priorityWithinOne),
    routing: pct(m.routingAccuracy),
    needsTriage: pct(m.needsTriageRate),
    noneRecall: pct(m.noneRecall),
  };
}

const steps = (from: number, to: number, by: number) =>
  Array.from({ length: Math.round((to - from) / by) + 1 }, (_, i) => Number((from + i * by).toFixed(2)));

// Priority and routing do not interact, so each gets its own sweep.
function sweepPriority(rows: readonly EvalRow[], cache: Cache) {
  const results = steps(0.6, 0.9, 0.05).flatMap((urgent) =>
    steps(0.35, 0.65, 0.05).flatMap((high) =>
      steps(0.1, 0.4, 0.05).flatMap((normal) =>
        [0, 0.1].flatMap((frustration) => {
          if (!(urgent > high && high > normal)) return [];
          const params = {
            ...DEFAULT_PARAMS,
            thresholds: { urgent, high, normal },
            weights: { ...DEFAULT_PARAMS.weights, frustration },
          };
          return [{ urgent, high, normal, frustration, m: computeMetrics(score(rows, cache, params)) }];
        }),
      ),
    ),
  );
  const ranked = results.toSorted(
    (a, b) =>
      (b.m.urgentRecall ?? -1) - (a.m.urgentRecall ?? -1) ||
      (b.m.priorityExact ?? -1) - (a.m.priorityExact ?? -1) ||
      (b.m.priorityWithinOne ?? -1) - (a.m.priorityWithinOne ?? -1),
  );
  console.log("priority sweep, top 20 by urgent recall then exact match");
  console.table(
    ranked.slice(0, 20).map(({ m, ...p }) => ({ ...p, urgentRecall: pct(m.urgentRecall), exact: pct(m.priorityExact), withinOne: pct(m.priorityWithinOne) })),
  );
}

function sweepRouting(rows: readonly EvalRow[], cache: Cache) {
  console.log("routing floor sweep");
  console.table(
    steps(0.3, 0.9, 0.05).map((floor) => {
      const m = computeMetrics(score(rows, cache, { ...DEFAULT_PARAMS, teamConfidenceFloor: floor }));
      return { floor, routing: pct(m.routingAccuracy), needsTriage: pct(m.needsTriageRate), noneRecall: pct(m.noneRecall) };
    }),
  );
}
```

Replace the `parseArgs` block and everything after it with:

```ts
const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    refresh: { type: "boolean", default: false },
    sweep: { type: "boolean", default: false },
  },
});

const rows = await loadRows();
const { cache, errored } = await fillCache(rows, await loadCache(), values.refresh);
const labelled = score(rows, cache, DEFAULT_PARAMS).length;
console.log(
  `${Object.keys(cache).length}/${rows.length} cached, ${errored.length} errored this run, ${labelled} labelled and scored`,
);

if (labelled === 0) {
  console.log("no labelled rows yet: fill expected_priority and expected_team in tests/fixtures/evalset.csv");
} else if (values.sweep) {
  sweepPriority(rows, cache);
  sweepRouting(rows, cache);
} else {
  const m = computeMetrics(score(rows, cache, DEFAULT_PARAMS));
  console.table(summary(m));
  console.log("misroutes (expected->got):", m.misroutes);
}
if (errored.length > 0) process.exitCode = 1;
```

- [ ] **Step 6: Type-check and run**

Run: `bunx tsc --noEmit && bun run eval && bun run eval --sweep`
Expected: tsc silent. Without labels, both runs print `0 labelled and scored` and the "no labelled rows yet" line. With labels, a metrics table, then two sweep tables.

- [ ] **Step 7: Commit**

```bash
git add scripts/metrics.ts scripts/eval.ts tests/metrics.test.ts
git commit -m "feat: report eval metrics and sweep policy thresholds offline"
```

---

### Task 7: Tune the policy against labelled data (needs the Task 2 labels)

**Files:**
- Modify: `src/triage/policy.ts` (`DEFAULT_PARAMS`)
- Modify: `docs/superpowers/specs/2026-09-18-ticket-triage-design.md` (Section 3 and open questions)

**Interfaces:**
- Consumes: everything above; a fully labelled `tests/fixtures/evalset.csv`.
- Produces: tuned `DEFAULT_PARAMS` and a recorded rationale.

- [ ] **Step 1: Confirm labels are complete**

Run: `bun run eval`
Expected: `60 labelled and scored`. If fewer, stop and ask the person to finish labelling.

- [ ] **Step 2: Record the baseline**

Copy the metrics table and misroutes line produced with the spec's starting guesses. Watch the `technical_support->onboarding` and `onboarding->technical_support` counts. The spec names that boundary as the one expected to fail.

- [ ] **Step 3: Sweep**

Run: `bun run eval --sweep`

Choose priority thresholds from the top of the priority table. The ranking already puts urgent recall first. Among rows tied on urgent recall, prefer the higher exact match. Compare the best `frustration: 0` row against the best `frustration: 0.1` row. If they tie on urgent recall and exact match, pick 0 and record that frustration becomes tag-only (open question 2).

Choose the routing floor from the routing table: the lowest floor whose routing accuracy stays at or above the baseline, so as few tickets as possible land in needs-triage.

With 60 tickets, one ticket moves a rate by 1.7 points. Do not chase a difference of one ticket. Prefer round values.

- [ ] **Step 4: Update `DEFAULT_PARAMS`**

Edit the values in `src/triage/policy.ts` and replace its comment with one that states the source, for example:

```ts
// Swept against the 60-ticket eval cache on <date>: urgent recall <x>%, exact <y>%.
// Gate thresholds (junk/security/outage) were not swept; see spec Section 3.
```

- [ ] **Step 5: Verify**

Run: `bun test && bunx tsc --noEmit && bun run eval`
Expected: all tests pass (they pin their own params, so they must not need edits), and the metrics match the sweep row you chose.

- [ ] **Step 6: Record the result in the spec**

In spec Section 3, add a short "Tuned values" paragraph under the starting guesses with the chosen numbers and the metrics they produced. Under "Open questions", mark question 2 answered and give the reason. Set the spec's status line to match.

- [ ] **Step 7: Commit**

```bash
git add src/triage/policy.ts docs/superpowers/specs/2026-09-18-ticket-triage-design.md
git commit -m "feat: tune triage thresholds against the labelled eval set"
```

---

## Out of scope for this plan

Spec Sections 6 (Zendesk) and 7 (frontend) are deferred and not built. The constraints Section 7 places on current work are covered: `evidence` stays complete (looseObject, Task 1) and `policy.ts` stays pure (Task 5).
