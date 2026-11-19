"use client";

import { useState } from "react";
import { LifeBuoy, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useChronicle } from "@/lib/store";
import { isStandalone } from "@/lib/pwa";
import { FEEDBACK_MIN_LENGTH, FEEDBACK_TOPICS, LIMITS, type FeedbackReport, type FeedbackTopic } from "@/lib/report";
import { useAccount } from "@/components/account/account-session";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { Chip } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { SaveNote, SettingsSection } from "./section";

const PLACEHOLDER: Record<FeedbackTopic, string> = {
  suggestion: "It would help if the Roadmap could…",
  problem: "On the Mocks page, when I press Save, …",
  question: "How do I…",
  other: "Write anything you'd like the team to know.",
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

/**
 * Suggestions, problems and questions, sent to the team as an email, and
 * the switch for automatic crash reports. Where they go is set on the
 * server; the address never reaches the browser.
 */
export function FeedbackSettings() {
  const { user, mode } = useAccount();
  const crashReports = useChronicle((s) => s.profile.crashReports !== false);
  const updateProfile = useChronicle((s) => s.updateProfile);
  const [topic, setTopic] = useState<FeedbackTopic>("suggestion");
  const [message, setMessage] = useState("");
  const [includeEmail, setIncludeEmail] = useState(true);
  const [includeDetails, setIncludeDetails] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cloud = mode === "cloud";
  const email = cloud ? user?.email : undefined;
  const length = message.trim().length;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (length < FEEDBACK_MIN_LENGTH) return setError(`Write at least ${FEEDBACK_MIN_LENGTH} characters, so there's something to go on.`);
    setError(null);
    setNote(null);
    setBusy(true);
    const report: FeedbackReport = {
      kind: "feedback",
      topic,
      message: message.trim(),
      includeEmail: Boolean(email) && includeEmail,
      includeDetails,
      ...(includeDetails
        ? {
            userAgent: navigator.userAgent.slice(0, LIMITS.userAgent),
            screen: `${window.innerWidth}×${window.innerHeight}`,
            installed: isStandalone(),
          }
        : {}),
    };
    const token = (await supabase?.auth.getSession())?.data.session?.access_token;
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(report),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    if (!res?.ok) {
      return setNote({ kind: "err", text: body?.error ?? "Couldn't reach the server. Check your connection, then try again." });
    }
    setMessage("");
    setNote({
      kind: "ok",
      text: report.includeEmail ? `Sent. Any reply will come to ${email}.` : "Sent. Thank you for writing.",
    });
  }

  return (
    <SettingsSection
      id="feedback"
      icon={LifeBuoy}
      title="Help & feedback"
      description="Suggestions, problems and questions go straight to the team by email. So do crash reports, unless you switch them off."
    >
      <form onSubmit={send} className="space-y-4" noValidate>
        <div role="group" aria-label="What it's about" className="flex flex-wrap gap-2">
          {FEEDBACK_TOPICS.map((t) => (
            <Chip key={t.id} type="button" active={topic === t.id} aria-pressed={topic === t.id} onClick={() => setTopic(t.id)}>
              {t.label}
            </Chip>
          ))}
        </div>

        <Field
          label="Your message"
          error={error}
          hint={`${length.toLocaleString()} of ${LIMITS.message.toLocaleString()} characters.`}
        >
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

        <div className="divide-y divide-line rounded-2xl border border-line px-4">
          {email && (
            <Row id="feedback-email-hint" title="Include my email" hint={`So the team can reply to ${email}. Without it, the message can't be answered.`}>
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
          <Button type="submit" disabled={busy}>
            <Send className="h-4 w-4" aria-hidden />
            {busy ? "Sending…" : "Send"}
          </Button>
          <SaveNote note={note} />
        </div>
      </form>

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
