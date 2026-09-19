# Support Ticket Triage with TypeSafe Jev

Date: 2026-09-18
Status: design approved through Section 1, Sections 2 and 3 pending review

## Problem

Support tickets arrive as free text. Two decisions have to be made about each one
before a human touches it: how urgent it is, and which team owns it. Both decisions
need semantic understanding of the text, and both need to be consistent, explainable,
and tunable after the fact.

This system makes those two decisions. It takes a ticket, asks TypeSafe's Jev model a
fixed set of narrow judgments about it, and applies an explicit policy in code to reach
a priority and a team.

## Scope

In scope: the judgment layer, the policy layer, a CLI for single tickets, and an
offline evaluation harness run against labelled public data.

Deferred, designed for but not built: the Zendesk integration. Section 6 records the
research so it does not have to be redone. A frontend visualization, noted in Section 7.

Out of scope: a queue, multi-language routing, reply drafting, and any model
training or fine-tuning.

## Section 1: Architecture

### Layout

```
ticket-triage/
├── src/
│   ├── types.ts              Ticket, TriageDecision, Answers
│   ├── config/teams.ts       team roster
│   ├── triage/questions.ts   Jev question definitions
│   ├── triage/policy.ts      Answers -> TriageDecision (pure, no network)
│   ├── triage/run.ts         Ticket -> TriageDecision
│   └── cli.ts                single-ticket CLI
├── scripts/
│   ├── build_evalset.py      Hugging Face rows -> tests/fixtures/evalset.csv
│   └── eval.ts               run the set, cache answers, print metrics
├── tests/
│   ├── policy.test.ts        table-driven, no network
│   └── fixtures/
│       ├── evalset.csv       60 labelled tickets
│       └── answers.json      cached raw Jev answers, keyed by ticket id
```

`policy.ts` holds every weight and threshold and performs no I/O. It is the file that
gets tuned and the only one with dense unit tests.

### Data flow

1. A `Ticket` arrives from the CLI or from the eval script.
2. `run.ts` builds a state object and issues one `POST /v1/systemone` call carrying
   every question at once. The questions are independent, so they run in parallel
   inside a single request.
3. `policy.ts` turns the answers into a `TriageDecision`.
4. The caller prints or records the decision alongside the raw answers.

### Boundary types

```ts
type Ticket = {
  id: string;
  subject: string;
  body: string;
};

type Priority = "low" | "normal" | "high" | "urgent";

type TriageDecision = {
  priority: Priority;
  team: string | null;              // null means no confident match
  tags: string[];
  evidence: Record<string, unknown>; // raw Jev answers, kept for audit and tuning
};
```

`Ticket` carries only fields a real ticketing system can supply. `Priority` uses
Zendesk's exact four values so the deferred writer is a field copy rather than a
mapping table. Nothing in `questions.ts` or `policy.ts` refers to Zendesk.

### What is deliberately absent

No HTTP server, no queue, no deploy target, no secret beyond `TYPESAFE_API_KEY`.
None of those can be exercised against anything real until there is a Zendesk
instance, and building them now means writing code that cannot be run.

## Section 2: The judgments

All seven questions go in one request over the same state. State is a JSON object so
the questions can reference fields by path:

```ts
const state = { ticket: { subject: t.subject, body: t.body } };
```

### Gates

These three drive branch decisions rather than contributing weight. The TypeSafe
guidance is explicit that an "any serious violation" rule needs separate conditions
rather than a blended score, because a weighted average lets a calm, patient security
report average itself down into `normal`.

| ID | Type | Instructions |
|---|---|---|
| `has_request` | Noul | "`ticket` contains a genuine request or problem report from a person." Criteria clarify that automated bounces, out-of-office replies, marketing mail, and empty messages are all no. |
| `is_security_or_data_loss` | Noul | "`ticket` reports a security incident, unauthorised access, a data breach, or customer data that has been lost or corrupted." |
| `is_outage` | Noul | "`ticket` describes the service being down or unreachable overall, rather than one feature behaving wrongly." |

### Priority dimensions

Three Scores, each one dimension, each level describing a concrete situation rather
than a vague degree.

`impact_severity`, five levels:

0. Nothing is broken. The message asks a question, gives feedback, or requests something for later.
1. Something is slower, uglier, or more awkward than it should be, and the customer can still do their work.
2. A feature the customer needs is broken, and a workaround exists or is implied.
3. The customer cannot do their work and mentions no workaround.
4. The customer's whole organisation is blocked, or customer data is lost or corrupted.

`time_pressure`, four levels:

0. The message refers to no deadline or timeframe at all.
1. The customer wants this resolved reasonably soon but names no date.
2. The customer names a deadline some days away, or says the problem is getting worse.
3. The customer names a deadline today or tomorrow, or says work has already stopped.

`customer_frustration`, four levels:

0. Calm and matter of fact.
1. Mildly annoyed but polite.
2. Clearly frustrated; complains about the product or about previous support.
3. Angry; threatens to cancel, escalate, or make the problem public.

### Routing

`team` is a Choice over the six roster entries plus an explicit `none`. The criteria
map is generated from `config/teams.ts`, combining each entry's `owns` line with its
`not` line so Jev sees the contrast against the neighbouring team rather than having
to infer one.

The roster:

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
```

`technical_support` against `onboarding` is the boundary that will actually fail.
"It's broken" and "I can't work out how to do this" arrive in near-identical words
from an annoyed customer. Watch that cell of the confusion matrix specifically.

## Section 3: The policy

`decide(answers): TriageDecision` runs gates first, then the weighted score.

### Gates, in order

```
has_request.noul < 0.3
  -> priority "low", team null, tags ["jev-triaged", "needs-triage", "jev-junk"]

is_security_or_data_loss.noul > 0.7
  -> priority "urgent", tags include "jev-security"; routing continues normally

is_outage.noul > 0.7
  -> priority "urgent"; routing continues normally
```

### Weighted urgency, when no gate fires

Scores normalise by dividing by `criteria.length - 1`, per the TypeSafe guidance on
combining Scores.

```
impact = impact_severity.score / 4
time   = time_pressure.score / 3
frust  = customer_frustration.score / 3

urgency = 0.60 * impact + 0.30 * time + 0.10 * frust
```

```
urgency >= 0.75  -> urgent
urgency >= 0.50  -> high
urgency >= 0.25  -> normal
otherwise        -> low
```

Frustration carries the smallest weight on purpose. It is real signal for escalation
but it rewards customers who shout and penalises customers who are polite about a
genuinely severe problem. It also gets emitted as a standalone `jev-frustrated` tag
when `customer_frustration.score >= 2`, so a manager can build a view on it without it
distorting priority.

**Every number in this section is a starting guess.** They are placeholders to be
swept against the eval cache in Section 4, not tuned values. Treat any of them found
unchanged after evaluation as a bug.

### Routing decision

```
team.choice === "none"        -> team null, tag "needs-triage"
team.confidence < 0.6         -> team null, tags "needs-triage" and "jev-guess-<choice>"
otherwise                     -> team = choice
```

Recording the suppressed guess as a tag means a later question of "how often would
lowering the floor to 0.5 have been correct?" is answerable from data already
collected, without paying for inference again.

### Tags emitted

`jev-triaged` always. Then `jev-p-<priority>`, and any of `needs-triage`,
`jev-guess-<team>`, `jev-junk`, `jev-security`, `jev-frustrated` that apply.

### Failure handling

A failed or malformed Jev call produces no decision. The response is validated with
zod against the documented answer shape before `policy.ts` sees it, so a shape change
in the API surfaces as a parse error rather than as `undefined` quietly scoring zero.
The CLI exits non-zero. The eval script records the ticket as errored and continues.

## Section 4: Evaluation

### Building the set

Source: [Tobi-Bueck/customer-support-tickets](https://huggingface.co/datasets/Tobi-Bueck/customer-support-tickets),
61,800 rows, CC-BY-NC-4.0.

Loaded with the Hugging Face `datasets` library, so no manual download or Kaggle-style
API key is needed:

```python
from datasets import load_dataset

ds = load_dataset("Tobi-Bueck/customer-support-tickets")
```

This makes `build_evalset.py` the one Python file in a TypeScript project. It runs once,
writes `tests/fixtures/evalset.csv`, and nothing in `src/` imports from it. Only the CSV
crosses the language boundary. Run it with `uv run --with datasets scripts/build_evalset.py`
so the repo needs no Python project file.

Verified column values:

| Column | Values |
|---|---|
| `priority` | critical 1,914 / high 21,925 / medium 23,378 / low 12,765 / very_low 1,783 |
| `type` | Incident / Request / Problem / Change |
| `queue` | 52 values, led by Technical Support 14,186, Product Support 8,960, Customer Service 7,420, IT Support 5,725, Billing and Payments 4,874 |
| `language` | de 33,504 / en 28,261 |

The Kaggle `suraj520` alternative was rejected: its rows are fabricated with the Faker
library, so its text is templated and its labels script-assigned. Calibrating
thresholds against it would measure Faker rather than customer behaviour.

`build_evalset.py` filters to `language == "en"` and samples 60 rows stratified on
`priority` and `queue`, deliberately including five `Human Resources` rows. Those sit
outside a SaaS support roster, so they are the only way to verify the no-match branch
ever fires. A router that never says "I don't know" is a failure worth catching before
it reaches production.

The dataset's own `priority` and `queue` are sampling strata only, never ground truth.
They encode a different company's policy on a five-value scale. Labels come from a
human filling in `expected_priority` and `expected_team` in the CSV against this
project's roster.

### The harness

`eval.ts` calls Jev once per ticket and writes the raw answers to
`tests/fixtures/answers.json` keyed by ticket id. Every subsequent run reads the
cache unless `--refresh` is passed.

This is the point of the split between judgment and policy. Question meanings and
evidence do not change when a weight moves from 0.60 to 0.55, so policy tuning becomes
an offline loop over a JSON file: free, and fast enough to sweep. Inference gets paid
for once, for 60 tickets.

### Metrics

Priority exact match, priority within-one, routing accuracy over the tickets that were
actually routed, and the needs-triage rate.

Reported separately and weighted above the rest: **urgent recall**, meaning the share
of human-labelled urgent tickets the system called urgent. The two errors are not
symmetric. Calling a normal ticket urgent costs an agent a few minutes of attention.
Missing a genuinely urgent ticket costs a customer. Thresholds should be chosen to
protect recall on urgent and accept the false positives that come with it.

`--sweep` walks the three priority thresholds and the routing confidence floor over the
cache and prints the metric table for each, so the chosen numbers come from the data
rather than from this document.

## Section 5: Build order

1. `types.ts`, `config/teams.ts`, and `build_evalset.py`. Produce the CSV and label it by hand.
2. `questions.ts`, `run.ts`, `cli.ts`. Verify by hand against five tickets, reading the raw answers rather than the decision.
3. `eval.ts` with answer caching. Populate `answers.json`.
4. `policy.ts` and `policy.test.ts`, tuned against the cache with `--sweep`.
5. Deferred: Section 6.

Step 2 before step 4 is deliberate. The questions have to produce sane raw answers
before there is any point composing them, and reading raw distributions on a handful
of tickets catches a badly worded criterion faster than any metric will.

## Section 6: Deferred Zendesk integration

Recorded so the research is not lost. Not built.

Attaching takes two files. An inbound adapter parsing a webhook body into `Ticket`,
and an outbound writer turning a `TriageDecision` into a ticket update. Nothing in
Sections 1 through 4 changes.

Shape, when the time comes:

- A Zendesk trigger on *Ticket Created*, conditioned on `Tags does not contain jev-triaged`, POSTs a JSON body template to one endpoint. The body template is authored by hand, so the payload shape is chosen rather than discovered.
- The endpoint verifies `X-Zendesk-Webhook-Signature` against `base64(HMAC-SHA256(X-Zendesk-Webhook-Signature-Timestamp + rawBody))` using the webhook's signing secret. Zendesk publishes `dGhpc19zZWNyZXRfaXNfZm9yX3Rlc3Rpbmdfb25seQ==` as a fixed test secret, so signature verification can be unit tested with no account.
- Write-back is one `PUT /api/v2/tickets/{id}.json` setting `priority`, `group_id`, and `tags`.
- Two loop guards, because the write-back is itself a ticket update: the trigger condition, and a re-check of `jev-triaged` on arrival. The trigger lives in a web UI outside version control, so the code should not trust it.
- After signature verification passes, return 200 even on internal failure. A non-2xx makes Zendesk retry, and a retry storm on an expired API key helps nobody.
- Sandboxes are an Enterprise feature. Development uses a free trial account seeded through the Create Ticket endpoint from the same eval CSV.
- Open question deferred with it: whether an end-user comment on an open ticket should trigger re-triage, or only ticket creation.

## Section 7: Deferred frontend visualization

Planned for later. Not built.

The data it needs already exists. `TriageDecision.evidence` keeps the raw Jev answers
for every decision, and `tests/fixtures/answers.json` holds them for the whole eval set.
Nothing in Sections 1 through 4 has to change to support it. The one constraint on
current work: keep `evidence` complete and keep `policy.ts` pure, so a frontend can
re-run `decide()` in the browser when someone drags a weight or threshold.

## Open questions

1. Roster `not` lines encode policy that was guessed at. They need a human pass before the eval set is labelled, because the labels and the criteria have to agree.
2. Whether `customer_frustration` belongs in the priority formula at all, or should be tag-only. The sweep in Section 4 can answer this by comparing metrics at weight 0.10 against weight 0.
