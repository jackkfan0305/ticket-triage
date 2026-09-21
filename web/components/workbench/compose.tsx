"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const SUBJECT_MAX = 200;
export const BODY_MAX = 5000;

// same caps the route enforces
const SAMPLES = [
  {
    subject: "URGENT: customer records showing another account's data after this morning's deploy",
    body: "Since about 09:15 UTC three of our account managers have opened customer profiles and seen billing details belonging to a different company. We have told staff to stop using the CRM. We need to know immediately whether data was exposed outside our organisation, and we have a regulator notification window of 72 hours.",
  },
  {
    subject: "Re: Re: Out of Office AutoReply",
    body: "I am currently out of the office with limited access to email and will return on Monday. For urgent matters please contact the duty desk.",
  },
  {
    subject: "Can you extend our trial by a week?",
    body: "Hi, we are still evaluating and our trial ends Friday. Our procurement person is on leave until next Tuesday so we cannot get a PO signed in time. Could you push the end date out by a week or so? Nothing is broken, we just need a bit more runway.",
  },
];

type ComposeProps = {
  busy: boolean;
  error: string | null;
  onSubmit: (input: { subject: string; body: string }) => void;
};

/** A counter that turns red on the cap the route would reject. */
function Counted({ length, max }: { length: number; max: number }) {
  return (
    <p className={`num mt-1.5 text-end text-[11px] ${length > max ? "text-p-urgent" : "text-ink-3"}`}>
      {length} / {max}
    </p>
  );
}

export function Compose({ busy, error, onSubmit }: ComposeProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const overSubject = subject.length > SUBJECT_MAX;
  const overBody = body.length > BODY_MAX;
  const empty = body.trim().length === 0;

  return (
    <>
      <p className="mx-auto m-0 mb-6 max-w-[54ch] text-center text-[13px] leading-relaxed text-balance text-ink-2">
        Paste anything a customer might send. It goes through the same seven questions and the same
        policy as the eval set, and comes back with the full evidence behind the verdict.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || empty || overSubject || overBody) return;
          onSubmit({ subject: subject.trim(), body: body.trim() });
        }}
        className="rounded-2xl border border-line bg-panel p-4 shadow-sm sm:p-5"
      >
        <div className="mb-5">
          <Label htmlFor="compose-subject" className="cap mb-1.5 block text-ink-3">
            Subject
          </Label>
          <Input
            id="compose-subject"
            value={subject}
            maxLength={SUBJECT_MAX}
            placeholder="Cannot log in after SSO change"
            onChange={(event) => setSubject(event.target.value)}
            className="bg-panel-2"
          />
          <Counted length={subject.length} max={SUBJECT_MAX} />
        </div>

        <div className="mb-5">
          <Label htmlFor="compose-body" className="cap mb-1.5 block text-ink-3">
            Body
          </Label>
          <Textarea
            id="compose-body"
            value={body}
            maxLength={BODY_MAX}
            rows={8}
            placeholder="Describe the problem the way a customer would…"
            onChange={(event) => setBody(event.target.value)}
            className="min-h-44 bg-panel-2"
          />
          <Counted length={body.length} max={BODY_MAX} />
        </div>

        {/* the action stays in the flow of the card, and stacks before it
            crowds the hint beside it */}
        <div className="flex flex-col-reverse items-stretch gap-2.5 sm:flex-row sm:items-center sm:justify-end">
          {empty && (
            <span className="text-center text-xs text-ink-3 sm:me-auto sm:text-start">
              Body is required.
            </span>
          )}
          <Button type="submit" disabled={busy || empty || overSubject || overBody}>
            {busy ? "Classifying…" : "Classify"}
          </Button>
        </div>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </form>

      <section aria-labelledby="samples-heading" className="mt-8">
        <h2 id="samples-heading" className="cap mb-2.5 text-center text-ink-3">
          Or start from one of these
        </h2>
        {/* three side by side while each still holds a readable line, one
            column once they do not */}
        <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-3">
          {SAMPLES.map((sample, index) => (
            <li key={sample.subject} className="flex">
              <button
                type="button"
                onClick={() => {
                  setSubject(sample.subject);
                  setBody(sample.body);
                }}
                className="flex w-full flex-col gap-1 rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-start text-xs text-ink-2 transition-colors hover:border-brand hover:text-ink"
              >
                <span className="num text-[10.5px] tracking-[0.04em] text-ink-3">
                  sample {index + 1}
                </span>
                <span className="line-clamp-3 leading-snug">{sample.subject}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
