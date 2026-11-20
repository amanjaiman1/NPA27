"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { CircleCheck, RotateCcw, Send, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/form";
import { errorText, reportCrash, sendCrashReport, type SendResult } from "@/lib/crash-report";
import { LIMITS, type CrashSource } from "@/lib/report";
import { cn } from "@/lib/utils";

type Failure = Error & { digest?: string };

/** What happened to the report sent on its own, in a line. Nothing to say for the rest. */
const AUTO_LINE: Partial<Record<SendResult | "sending", string>> = {
  sending: "Sending a crash report…",
  sent: "A crash report went to the team: the error and this page's address, nothing you wrote.",
  off: "Crash reports are switched off in Help & feedback, so nothing was sent on its own.",
  ask: "Send the team a crash report? It holds the error and this page's address, nothing you wrote.",
  unavailable: "Crash reports aren't set up on this server, so nothing was sent.",
  failed: "The crash report couldn't be sent.",
};

/** A newer version was deployed while this tab was open: only a reload fetches it. */
function isStaleBuild(error: Failure): boolean {
  return error.name === "ChunkLoadError" || /Loading (CSS )?chunk [\w-]+ failed/i.test(error.message);
}

/**
 * What a page shows when it fails to draw. Reports the crash once (when the
 * account allows it), lets the person say what they were doing, and offers
 * a way back. `fullPage` fills the screen, for failures outside the app's frame.
 */
export function ErrorScreen({
  error,
  reset,
  source = "render",
  fullPage = false,
}: {
  error: Failure;
  reset: () => void;
  source?: CrashSource;
  fullPage?: boolean;
}) {
  const [auto, setAuto] = useState<SendResult | "sending">("sending");
  const [note, setNote] = useState("");
  const [sendState, setSendState] = useState<SendResult | "idle" | "sending">("idle");
  const noteId = useId();
  const stale = isStaleBuild(error);

  useEffect(() => {
    let live = true;
    void reportCrash({ error, source, digest: error.digest }).then((result) => live && setAuto(result));
    return () => {
      live = false;
    };
  }, [error, source]);

  // Nothing went yet, so the button sends the report itself, with or without a note.
  const asking = auto === "ask";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = note.trim();
    if ((!text && !asking) || sendState === "sending") return;
    setSendState("sending");
    setSendState(await sendCrashReport({ error, source, digest: error.digest, ...(text ? { note: text } : {}) }));
  }

  const autoLine = sendState === "sent" ? undefined : AUTO_LINE[auto];
  const canSend = auto !== "unavailable" && auto !== "sending" && sendState !== "sent";
  const home = fullPage ? { href: "/", label: "Go to the home page" } : { href: "/dashboard", label: "Go to the dashboard" };

  return (
    <div className={cn("grid place-items-center px-4", fullPage ? "min-h-[100dvh] py-12" : "py-10 sm:py-16")}>
      <Card className="w-full max-w-lg p-6 sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-danger/10 text-danger ring-1 ring-danger/20">
          <TriangleAlert className="h-5 w-5" aria-hidden />
        </span>
        <div role="alert">
          <h1 className="mt-5 font-display text-xl font-semibold tracking-snugg text-paper sm:text-2xl">
            {stale ? "DoOrDie was just updated." : "This page ran into a problem."}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-paper/65">
            {stale
              ? "This tab is still running the older version. Reload to get the new one. Your saved work is safe."
              : "Nothing you saved has been lost. The error happened while showing this page. Try again, or head back."}
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
          <Button onClick={() => (stale ? window.location.reload() : reset())}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            {stale ? "Reload" : "Try again"}
          </Button>
          <Link
            href={home.href}
            className="inline-flex h-10 items-center justify-center rounded-full border border-line px-4 text-sm font-semibold text-paper transition-colors hover:border-paper/25"
          >
            {home.label}
          </Link>
        </div>

        {!stale && (
          <div className="mt-7 border-t border-line pt-5">
            {autoLine && (
              <p aria-live="polite" className="text-xs leading-relaxed text-paper/55">
                {autoLine}
              </p>
            )}

            {sendState === "sent" ? (
              <p role="status" className="flex items-center gap-2 text-sm font-medium text-positive">
                <CircleCheck className="h-4 w-4" aria-hidden />
                {note.trim() ? "Thanks. Your note went to the team with the error." : "Thanks. The crash report went to the team."}
              </p>
            ) : (
              canSend && (
                <form onSubmit={send} className="mt-3 space-y-2.5">
                  <label htmlFor={noteId} className="block text-[0.78rem] font-semibold tracking-snugg text-paper/60">
                    What were you doing when it happened? <span className="font-normal text-paper/45">Optional</span>
                  </label>
                  <Textarea
                    id={noteId}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={LIMITS.note}
                    placeholder="I opened last week's review and pressed Edit…"
                    className="min-h-[72px]"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="submit"
                      size="sm"
                      variant="ghost"
                      disabled={(!note.trim() && !asking) || sendState === "sending"}
                    >
                      <Send className="h-3.5 w-3.5" aria-hidden />
                      {sendState === "sending" ? "Sending…" : asking ? "Send crash report" : "Send note"}
                    </Button>
                    {(sendState === "failed" || sendState === "skipped" || sendState === "unavailable") && (
                      <span role="alert" className="text-xs text-danger">
                        {sendState === "skipped"
                          ? "You've sent a few already from this tab. Thank you."
                          : sendState === "unavailable"
                            ? "Reports aren't set up on this server."
                            : "It couldn't be sent. Try again in a minute."}
                      </span>
                    )}
                  </div>
                </form>
              )
            )}

            <details className="mt-4 text-xs text-paper/50">
              <summary className="cursor-pointer select-none font-semibold text-paper/55 hover:text-paper">
                Technical details
              </summary>
              <p className="mt-2 break-words font-mono text-[0.7rem] leading-relaxed">{errorText(error).message}</p>
              {error.digest && <p className="mt-1 font-mono text-[0.7rem]">Reference: {error.digest}</p>}
            </details>
          </div>
        )}
      </Card>
    </div>
  );
}
