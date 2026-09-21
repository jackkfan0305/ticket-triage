"use client";

import { useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { PenLine, X } from "lucide-react";
import { cn } from "cn";
import { DEFAULT_PARAMS } from "../../../src/triage/policy";
import { Button, buttonVariants } from "@/components/ui/button";
import { classify } from "@/lib/classify";
import type { Row } from "@/lib/rows";
import { Compose } from "./compose";
import { Detail } from "./detail";

/**
 * A ticket the reader writes, over the floor rather than away from it.
 *
 * It has no id in the eval set, so the evidence is shown in the window itself
 * rather than at /tickets/…, and it stays out of the run session: it is not
 * part of a run, and a Start or a Reset has no business clearing it.
 *
 * The verdict uses the default policy: the thresholds on the floor are that
 * component's own state and do not reach in here.
 */
export function ComposeDialog() {
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
      setRow({ id, subject: subject || "(no subject)", body, live, pending: false, own: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Classification failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root>
      <Dialog.Trigger
        aria-label="Write your own ticket"
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "rounded-full")}
      >
        <PenLine aria-hidden="true" className="size-3.5" />
      </Dialog.Trigger>

      <Dialog.Portal>
        {/* the floor stays visible behind the window, but out of focus, so the
            window reads as a thing on top of the run rather than a new page */}
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/25 backdrop-blur-md transition-opacity duration-200 data-closed:opacity-0 dark:bg-black/50" />

        {/* centred by auto margins rather than a transform, so the entrance
            still owns translate */}
        <Dialog.Popup className="fixed inset-0 z-50 m-auto flex h-fit max-h-[calc(100dvh-2rem)] w-[min(44rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl border border-line bg-panel shadow-2xl transition-[opacity,translate] duration-200 data-closed:translate-y-2 data-closed:opacity-0">
          <header className="flex flex-none items-start gap-3 px-6 pt-6 pb-5 sm:px-8">
            <div className="min-w-0">
              <Dialog.Title className="m-0 text-heading leading-[1.2] font-medium tracking-[-0.02em]">
                Write your own ticket
              </Dialog.Title>
              <Dialog.Description className="mt-2 mb-0 max-w-[58ch] text-meta leading-relaxed text-ink-2">
                Paste anything a customer might send. It goes through the same seven questions and
                the same policy as the eval set, and comes back with the full evidence behind the
                verdict.
              </Dialog.Description>
            </div>
            <div className="ms-auto flex flex-none items-center gap-1">
              {row && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-meta"
                  onClick={() => {
                    setRow(null);
                    setError(null);
                  }}
                >
                  Write another
                </Button>
              )}
              <Dialog.Close
                aria-label="Close"
                className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "rounded-full")}
              >
                <X aria-hidden="true" className="size-3.5" />
              </Dialog.Close>
            </div>
          </header>

          {/* the window is capped, so a long verdict scrolls inside it and the
              floor underneath never moves */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 sm:px-8">
            {row ? (
              <Detail row={row} params={DEFAULT_PARAMS} />
            ) : (
              <Compose busy={busy} error={error} onSubmit={submit} />
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
