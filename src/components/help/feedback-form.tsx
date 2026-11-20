"use client";

import { useRef } from "react";
import { CheckCircle2, ImagePlus, MessagesSquare, PenLine, Send, X } from "lucide-react";
import { isStandalone } from "@/lib/pwa";
import { FEEDBACK_MIN_LENGTH, FEEDBACK_TOPICS, LIMITS, type FeedbackTopic } from "@/lib/report";
import { prepareScreenshot, type Screenshot } from "@/lib/platform/screenshot";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { Chip } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";

const PLACEHOLDER: Record<FeedbackTopic, string> = {
  bug: "On the Mocks page, when I press Save, …",
  feature: "It would help if the Roadmap could…",
  suggestion: "The Revision page would be easier to use if…",
  usability: "I couldn't work out how to…",
  general: "Write anything you'd like the team to know.",
};

/** What's been typed so far. Kept by Help & feedback while the panel is closed, so nothing is lost. */
export interface FeedbackDraft {
  topic: FeedbackTopic;
  message: string;
  includeDetails: boolean;
  shot: Screenshot | null;
}

export const EMPTY_DRAFT: FeedbackDraft = { topic: "suggestion", message: "", includeDetails: true, shot: null };

/** The browser and window, sent only when the person leaves the switch on. */
export function technicalDetails() {
  return {
    userAgent: navigator.userAgent.slice(0, LIMITS.userAgent),
    screen: `${window.innerWidth}×${window.innerHeight}`,
    installed: isStandalone(),
  };
}

export type FormState =
  | { kind: "editing"; error: string | null }
  | { kind: "sending" }
  | { kind: "sent"; screenshotFailed: boolean };

/**
 * A bug report, an idea, a question or anything else, with a screenshot if
 * it helps. It goes to the team's Feedback Center as the signed-in account;
 * no email address goes with it, and the team answers in Your messages.
 */
export function FeedbackForm({
  draft,
  onDraft,
  state,
  onSend,
  onAnother,
  onSeeMessages,
  available,
  preparing,
  onPreparing,
}: {
  draft: FeedbackDraft;
  onDraft: (patch: Partial<FeedbackDraft>) => void;
  state: FormState;
  onSend: () => void;
  onAnother: () => void;
  onSeeMessages: () => void;
  /** False when the Feedback Center isn't set up on this server. */
  available: boolean;
  preparing: { busy: boolean; error: string | null };
  onPreparing: (p: { busy: boolean; error: string | null }) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const length = draft.message.trim().length;
  const busy = state.kind === "sending";
  const error = state.kind === "editing" ? state.error : null;

  async function pick(file: File | undefined) {
    if (!file) return;
    onPreparing({ busy: true, error: null });
    try {
      onDraft({ shot: await prepareScreenshot(file) });
      onPreparing({ busy: false, error: null });
    } catch (e) {
      onPreparing({ busy: false, error: e instanceof Error ? e.message : "That image couldn't be used." });
    }
  }

  if (state.kind === "sent") {
    return (
      <div role="status" className="rounded-2xl border border-positive/30 bg-positive/[0.07] p-5 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-positive" aria-hidden />
        <p className="mt-3 text-base font-semibold text-paper">Sent to the team</p>
        <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-paper/70">
          It&apos;s in their Feedback Center now. When they answer, it appears in Your messages, and the bell tells you.
          {state.screenshotFailed ? " The screenshot couldn't be attached." : ""}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button size="sm" onClick={onSeeMessages}>
            <MessagesSquare className="h-3.5 w-3.5" aria-hidden /> See your messages
          </Button>
          <Button size="sm" variant="ghost" onClick={onAnother}>
            <PenLine className="h-3.5 w-3.5" aria-hidden /> Send another
          </Button>
        </div>
      </div>
    );
  }

  if (!available) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-sm leading-relaxed text-paper/65">
        Messages can&apos;t be sent from here at the moment: this part of DoOrDie isn&apos;t set up on the server yet. Please try
        again later.
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && !preparing.busy) onSend();
      }}
      className="space-y-4"
      noValidate
    >
      <div role="group" aria-label="What it's about" className="flex flex-wrap gap-2">
        {FEEDBACK_TOPICS.map((t, i) => (
          <Chip
            key={t.id}
            type="button"
            active={draft.topic === t.id}
            aria-pressed={draft.topic === t.id}
            onClick={() => onDraft({ topic: t.id })}
            // Focus starts here rather than in the text box, so a phone's keyboard doesn't jump up.
            data-autofocus={i === 0 ? true : undefined}
          >
            {t.label}
          </Chip>
        ))}
      </div>

      <Field label="Your message" error={error} hint={`${length.toLocaleString()} of ${LIMITS.message.toLocaleString()} characters. At least ${FEEDBACK_MIN_LENGTH}.`}>
        <Textarea
          value={draft.message}
          onChange={(e) => onDraft({ message: e.target.value })}
          maxLength={LIMITS.message}
          placeholder={PLACEHOLDER[draft.topic]}
          className="min-h-[110px]"
        />
      </Field>

      <div>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {draft.shot ? (
          <div className="flex items-center gap-3 rounded-2xl border border-line p-2.5">
            {/* A local object URL: next/image has nothing to optimise here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={draft.shot.preview} alt="The screenshot you're sending" className="h-12 w-16 shrink-0 rounded-lg border border-line object-cover" />
            <p className="min-w-0 flex-1 text-xs text-paper/60">Screenshot · {Math.max(1, Math.round(draft.shot.bytes / 1024))} KB</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => onDraft({ shot: null })}>
              <X className="h-3.5 w-3.5" aria-hidden /> Remove
            </Button>
          </div>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => fileInput.current?.click()} disabled={preparing.busy}>
            <ImagePlus className="h-4 w-4" aria-hidden /> {preparing.busy ? "Preparing…" : "Add a screenshot"}
          </Button>
        )}
        <p className="mt-1.5 text-[0.72rem] leading-relaxed text-paper/50">
          Optional: PNG, JPEG or WebP. It&apos;s made smaller on your device first, which also strips its camera and location details.
          Only the team sees it.
        </p>
        {preparing.error && (
          <p role="alert" className="mt-1 text-[0.72rem] font-medium text-danger">
            {preparing.error}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 rounded-2xl border border-line px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-sm text-paper">Include technical details</p>
          <p id="help-details-hint" className="mt-0.5 text-xs leading-relaxed text-paper/50">
            Your browser and its version, the window&apos;s size, and whether the app is installed.
          </p>
        </div>
        <Switch
          label="Include technical details"
          describedBy="help-details-hint"
          checked={draft.includeDetails}
          onChange={(v) => onDraft({ includeDetails: v })}
        />
      </div>

      <Button type="submit" disabled={busy || preparing.busy} className="w-full">
        <Send className="h-4 w-4" aria-hidden />
        {busy ? "Sending…" : "Send to the team"}
      </Button>
    </form>
  );
}
