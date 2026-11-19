"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, LifeBuoy, Send, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useChronicle } from "@/lib/store";
import { isStandalone } from "@/lib/pwa";
import { FEEDBACK_MIN_LENGTH, FEEDBACK_TOPICS, LIMITS, type FeedbackReport, type FeedbackTopic } from "@/lib/report";
import { apiCall, ApiError } from "@/lib/platform/client";
import { prepareScreenshot, type Screenshot } from "@/lib/platform/screenshot";
import type { MyFeedback } from "@/lib/platform/types";
import { useAccount } from "@/components/account/account-session";
import { useInbox } from "@/components/platform/inbox";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { Chip } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { SaveNote, SettingsSection } from "./section";
import { FeedbackHistory } from "./feedback-history";

const PLACEHOLDER: Record<FeedbackTopic, string> = {
  bug: "On the Mocks page, when I press Save, …",
  feature: "It would help if the Roadmap could…",
  suggestion: "The Revision page would be easier to use if…",
  usability: "I couldn't work out how to…",
  general: "Write anything you'd like the team to know.",
};

function Row({ id, title, hint, children }: { id: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-paper">{title}</p>
        <p id={id} className="mt-0.5 text-xs leading-relaxed text-paper/50">
          {hint}
        </p>
      </div>
      {children}
    </div>
  );
}

/** The browser and window, sent only when the person leaves the switch on. */
function technicalDetails() {
  return {
    userAgent: navigator.userAgent.slice(0, LIMITS.userAgent),
    screen: `${window.innerWidth}×${window.innerHeight}`,
    installed: isStandalone(),
  };
}

type Sent = MyFeedback & { screenshot: "stored" | "failed" | null; emailed: boolean };

/**
 * Bug reports, feature requests, suggestions and anything else, and the
 * switch for automatic crash reports. With an account, a message goes to the
 * Feedback Center: the team answers it there, and the answer and its status
 * appear under "Your messages". On this device only, it goes by email.
 */
export function FeedbackSettings() {
  const { user, mode } = useAccount();
  const inbox = useInbox();
  const crashReports = useChronicle((s) => s.profile.crashReports !== false);
  const updateProfile = useChronicle((s) => s.updateProfile);
  const [topic, setTopic] = useState<FeedbackTopic>("suggestion");
  const [message, setMessage] = useState("");
  const [includeEmail, setIncludeEmail] = useState(true);
  const [includeDetails, setIncludeDetails] = useState(true);
  const [shot, setShot] = useState<Screenshot | null>(null);
  const [shotError, setShotError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<MyFeedback[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const cloud = mode === "cloud";
  const email = cloud ? user?.email : undefined;
  const length = message.trim().length;
  // The Feedback Center needs its database tables. Until they exist, messages go by email as before.
  const [center, setCenter] = useState(cloud);

  useEffect(() => {
    setCenter(cloud);
    if (!cloud) return;
    let live = true;
    apiCall<{ items: MyFeedback[] }>("/api/feedback")
      .then((d) => live && setHistory(d.items))
      .catch((e: unknown) => {
        if (live && e instanceof ApiError && e.status === 503) setCenter(false);
      });
    return () => {
      live = false;
    };
  }, [cloud]);

  // The preview is an object URL: let it go when it's replaced or the page closes.
  useEffect(() => () => void (shot && URL.revokeObjectURL(shot.preview)), [shot]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setShotError(null);
    setPreparing(true);
    try {
      setShot(await prepareScreenshot(file));
    } catch (e) {
      setShotError(e instanceof Error ? e.message : "That image couldn't be used.");
    } finally {
      setPreparing(false);
    }
  }

  /** Into the Feedback Center. Null when it isn't set up, so the caller falls back to email. */
  async function toCenter(): Promise<Sent | null> {
    try {
      return await apiCall<Sent>("/api/feedback", {
        method: "POST",
        body: {
          category: topic,
          message: message.trim(),
          shareEmail: Boolean(email) && includeEmail,
          includeDetails,
          context: includeDetails ? technicalDetails() : {},
          screenshot: shot ? { type: shot.type, data: shot.data } : null,
        },
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        setCenter(false);
        return null;
      }
      throw e;
    }
  }

  /** By email, the way it worked before the Feedback Center: no screenshot, no history. */
  async function byEmail(): Promise<string> {
    const report: FeedbackReport = {
      kind: "feedback",
      topic,
      message: message.trim(),
      includeEmail: Boolean(email) && includeEmail,
      includeDetails,
      ...(includeDetails ? technicalDetails() : {}),
    };
    const token = (await supabase?.auth.getSession())?.data.session?.access_token;
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(report),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!res?.ok) throw new Error(body?.error ?? "Couldn't reach the server. Check your connection, then try again.");
    return report.includeEmail ? `Sent. Any reply will come to ${email}.` : "Sent. Thank you for writing.";
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy || preparing) return;
    if (length < FEEDBACK_MIN_LENGTH) return setError(`Write at least ${FEEDBACK_MIN_LENGTH} characters, so there's something to go on.`);
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      const sent = center ? await toCenter() : null;
      if (sent) {
        const { screenshot, emailed: _emailed, ...item } = sent;
        void _emailed;
        setHistory((h) => [{ ...item, hasScreenshot: screenshot === "stored" }, ...(h ?? [])]);
        setNote({
          kind: "ok",
          text: `Sent. The team's answer will appear below, under Your messages.${screenshot === "failed" ? " The screenshot couldn't be attached." : ""}`,
        });
      } else {
        setNote({ kind: "ok", text: await byEmail() });
      }
      setMessage("");
      setShot(null);
    } catch (err) {
      setNote({ kind: "err", text: err instanceof Error ? err.message : "That didn't send. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsSection
      id="feedback"
      icon={LifeBuoy}
      title="Help & feedback"
      description={
        center
          ? "Bugs, ideas and anything else go to the team's Feedback Center. Their answers and progress show up here."
          : "Suggestions, problems and questions go straight to the team by email. So do crash reports, unless you switch them off."
      }
    >
      <form onSubmit={send} className="space-y-4" noValidate>
        <div role="group" aria-label="What it's about" className="flex flex-wrap gap-2">
          {FEEDBACK_TOPICS.map((t) => (
            <Chip key={t.id} type="button" active={topic === t.id} aria-pressed={topic === t.id} onClick={() => setTopic(t.id)}>
              {t.label}
            </Chip>
          ))}
        </div>

        <Field label="Your message" error={error} hint={`${length.toLocaleString()} of ${LIMITS.message.toLocaleString()} characters.`}>
          <Textarea
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              if (error) setError(null);
              if (note) setNote(null);
            }}
            maxLength={LIMITS.message}
            placeholder={PLACEHOLDER[topic]}
            className="min-h-[120px]"
          />
        </Field>

        {center && (
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
            {shot ? (
              <div className="flex items-center gap-3 rounded-2xl border border-line p-2.5">
                {/* A local object URL: next/image has nothing to optimise here. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shot.preview} alt="The screenshot you're sending" className="h-14 w-20 shrink-0 rounded-lg border border-line object-cover" />
                <p className="min-w-0 flex-1 text-xs text-paper/60">Screenshot · {Math.max(1, Math.round(shot.bytes / 1024))} KB</p>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShot(null)}>
                  <X className="h-3.5 w-3.5" aria-hidden /> Remove
                </Button>
              </div>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => fileInput.current?.click()} disabled={preparing}>
                <ImagePlus className="h-4 w-4" aria-hidden /> {preparing ? "Preparing…" : "Add a screenshot"}
              </Button>
            )}
            <p className="mt-1.5 text-[0.72rem] leading-relaxed text-paper/50">
              Optional: PNG, JPEG or WebP. It&apos;s made smaller on your device first, which also strips its camera and location
              details. Only the team sees it, so check it shows nothing you&apos;d rather keep private.
            </p>
            {shotError && (
              <p role="alert" className="mt-1 text-[0.72rem] font-medium text-danger">
                {shotError}
              </p>
            )}
          </div>
        )}

        <div className="divide-y divide-line rounded-2xl border border-line px-4">
          {email && (
            <Row
              id="feedback-email-hint"
              title="Include my email"
              hint={
                center
                  ? `So the team can also write to ${email}. Their answer always appears here either way.`
                  : `So the team can reply to ${email}. Without it, the message can't be answered.`
              }
            >
              <Switch label="Include my email" describedBy="feedback-email-hint" checked={includeEmail} onChange={setIncludeEmail} />
            </Row>
          )}
          <Row
            id="feedback-details-hint"
            title="Include technical details"
            hint="Your browser and its version, the window's size, and whether the app is installed. Helps when something isn't working."
          >
            <Switch label="Include technical details" describedBy="feedback-details-hint" checked={includeDetails} onChange={setIncludeDetails} />
          </Row>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || preparing}>
            <Send className="h-4 w-4" aria-hidden />
            {busy ? "Sending…" : "Send"}
          </Button>
          <SaveNote note={note} />
        </div>
      </form>

      {center && history && history.length > 0 && <FeedbackHistory items={history} onSeen={() => inbox?.responsesSeen()} />}

      <div className="mt-6 border-t border-line pt-4">
        <Row
          id="crash-reports-hint"
          title="Send crash reports automatically"
          hint="When something breaks, the app sends the error, the page's address and your browser's details. Never your name, your account or anything you wrote."
        >
          <Switch
            label="Send crash reports automatically"
            describedBy="crash-reports-hint"
            checked={crashReports}
            onChange={(v) => updateProfile({ crashReports: v })}
          />
        </Row>
      </div>
    </SettingsSection>
  );
}
