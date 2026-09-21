"use client";

import { useRef, useState } from "react";
import { DEFAULT_PARAMS } from "../../../src/triage/policy";
import { useRunStore } from "@/components/run-store";
import { Button } from "@/components/ui/button";
import { classify } from "@/lib/classify";
import type { Row } from "@/lib/rows";
import { BackLink } from "./back-link";
import { Compose } from "./compose";
import { Detail } from "./detail";

/**
 * A ticket the reader writes, at its own address.
 *
 * It has no id in the eval set and no route of its own, so the evidence is
 * shown here rather than at /tickets/…. The answer still goes to the run store,
 * which is what every other surface reads.
 *
 * The verdict uses the default policy: the thresholds on the floor are that
 * page's own state and do not reach across a route.
 */
export function ComposePage() {
  const { record } = useRunStore();
  const [row, setRow] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const written = useRef(0);

  const submit = async ({ subject, body }: { subject: string; body: string }) => {
    setBusy(true);
    setError(null);
    written.current += 1;
    const id = `own-${written.current}`;

    try {
      const live = await classify({ subject, body });
      record(id, live);
      setRow({ id, subject: subject || "(no subject)", body, live, pending: false, own: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Classification failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="gutter pt-6 pb-20">
      {/* one column, centred, wide enough for a readable body field and no wider */}
      <div className="mx-auto w-full max-w-[44rem]">
        <div className="flex items-center gap-2.5 pb-6">
          <BackLink href="/" label="Triage floor" />
          <h1 className="m-0 text-[15px] font-medium tracking-tight">Write your own ticket</h1>
          {row && (
            <Button
              variant="ghost"
              size="sm"
              className="ms-auto rounded-full"
              onClick={() => {
                setRow(null);
                setError(null);
              }}
            >
              Write another
            </Button>
          )}
        </div>

        {row ? (
          <Detail row={row} params={DEFAULT_PARAMS} />
        ) : (
          <Compose busy={busy} error={error} onSubmit={submit} />
        )}
      </div>
    </main>
  );
}
