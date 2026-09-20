"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
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
  onBack: () => void;
};

export function Compose({ busy, error, onSubmit, onBack }: ComposeProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const overSubject = subject.length > SUBJECT_MAX;
  const overBody = body.length > BODY_MAX;
  const empty = body.trim().length === 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5 pt-4 pb-2.5">
        <Button variant="outline" size="sm" onClick={onBack} className="h-8 gap-1.5 text-xs">
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          All tickets
        </Button>
      </div>

      <form
        className="max-w-[45rem]"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || empty || overSubject || overBody) return;
          onSubmit({ subject: subject.trim(), body: body.trim() });
        }}
      >
        <h2 className="m-0 mb-1 text-base font-medium tracking-tight">Write your own ticket</h2>
        <p className="m-0 mb-4 max-w-[62ch] text-[12.5px] leading-relaxed text-ink-2">
          Paste anything a customer might send. It goes through the same seven questions and the same policy as the
          sixty above, and lands in the board with full evidence.
        </p>

        <div className="mb-3">
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
          <p className={`num mt-1 text-right text-[11px] ${overSubject ? "text-p-urgent" : "text-ink-3"}`}>
            {subject.length} / {SUBJECT_MAX}
          </p>
        </div>

        <div className="mb-3">
          <Label htmlFor="compose-body" className="cap mb-1.5 block text-ink-3">
            Body
          </Label>
          <Textarea
            id="compose-body"
            value={body}
            maxLength={BODY_MAX}
            rows={7}
            placeholder="Describe the problem the way a customer would…"
            onChange={(event) => setBody(event.target.value)}
            className="min-h-32 bg-panel-2"
          />
          <p className={`num mt-1 text-right text-[11px] ${overBody ? "text-p-urgent" : "text-ink-3"}`}>
            {body.length} / {BODY_MAX}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={busy || empty || overSubject || overBody}>
            {busy ? "Classifying…" : "Classify"}
          </Button>
          {empty && <span className="text-xs text-ink-3">Body is required.</span>}
        </div>

        {error && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </form>

      <section aria-labelledby="samples-heading" className="mt-5 max-w-[45rem] border-t border-line-soft pt-3">
        <h3 id="samples-heading" className="cap mb-2 text-ink-3">
          Or start from one of these
        </h3>
        <ul className="m-0 list-none space-y-1.5 p-0">
          {SAMPLES.map((sample, index) => (
            <li key={sample.subject}>
              <button
                type="button"
                onClick={() => {
                  setSubject(sample.subject);
                  setBody(sample.body);
                }}
                className="block w-full rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-left text-xs text-ink-2 transition-colors hover:border-brand hover:text-ink"
              >
                <span className="num block text-[11px] text-ink-3">sample {index + 1}</span>
                {sample.subject}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
