"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Globe, Lock, Send } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Chip, Segmented } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { TestimonialCard } from "@/components/marketing/review-card";
import { apiCall } from "@/lib/platform/client";
import {
  DISPLAY_PREFERENCE,
  RATING_LABEL,
  REVIEW_CONSENT_VERSION,
  REVIEW_FEATURES,
  REVIEW_LIMITS,
  REVIEW_STAGE,
  featureLabel,
  publicReviewName,
  type AspirantType,
  type DisplayPreference,
  type ReviewStage,
} from "@/lib/platform/content";
import type { AuthorReview, PublicReview } from "@/lib/platform/types";
import { cn } from "@/lib/utils";

const STEPS = ["Your rating", "Your experience", "Features you used", "About you", "Sharing"] as const;

interface Draft {
  rating: number;
  problemBefore: string;
  useful: string;
  changeNote: string;
  suggestions: string;
  body: string;
  features: string[];
  stage: ReviewStage | "";
  aspirantType: AspirantType | "";
  headline: string;
  displayName: string;
  displayPreference: DisplayPreference;
  showTenure: boolean;
  feedbackConsent: boolean;
  publicConsent: boolean;
}

function draftFrom(r: AuthorReview | null, defaultName: string): Draft {
  return {
    rating: r?.rating ?? 0,
    problemBefore: r?.problemBefore ?? "",
    useful: r?.useful ?? "",
    changeNote: r?.changeNote ?? "",
    suggestions: r?.suggestions ?? "",
    body: r?.body ?? "",
    features: r?.features ?? [],
    stage: r?.stage ?? "",
    aspirantType: r?.aspirantType ?? "",
    headline: r?.headline ?? "",
    displayName: r && r.displayPreference !== "anonymous" ? r.displayName : defaultName,
    displayPreference: r?.displayPreference ?? "name",
    showTenure: r?.showTenure ?? false,
    // A first review asks for both permissions afresh; neither is assumed.
    feedbackConsent: r ? r.feedbackConsent && r.status !== "withdrawn" : false,
    publicConsent: r ? r.publicConsent : false,
  };
}

/** What's wrong on this step, in the database's terms, or null. */
function problemAt(step: number, d: Draft): string | null {
  const len = (s: string) => s.trim().length;
  if (step === 0 && d.rating < 1) return "Choose a rating from 1 to 5.";
  if (step === 1) {
    if (len(d.problemBefore) > REVIEW_LIMITS.problemBefore || len(d.useful) > REVIEW_LIMITS.useful || len(d.changeNote) > REVIEW_LIMITS.changeNote)
      return "One of the answers is too long.";
    if (len(d.suggestions) > REVIEW_LIMITS.suggestions || len(d.body) > REVIEW_LIMITS.body[1]) return "One of the answers is too long.";
  }
  if (step === 3) {
    if (len(d.headline) && (len(d.headline) < REVIEW_LIMITS.headline[0] || len(d.headline) > REVIEW_LIMITS.headline[1]))
      return "Keep the headline between 3 and 80 characters.";
    if (d.displayPreference !== "anonymous" && (len(d.displayName) < REVIEW_LIMITS.name[0] || len(d.displayName) > REVIEW_LIMITS.name[1]))
      return "Choose a name of 2 to 40 characters, or show no name.";
  }
  if (step === 4) {
    if (!d.feedbackConsent) return "To send it, let the team read it. That alone never puts it on the website.";
    if (d.publicConsent && len(d.body) < REVIEW_LIMITS.body[0])
      return `A public testimonial needs at least ${REVIEW_LIMITS.body[0]} characters in "What would you tell another aspirant?". Go back to Your experience to add it.`;
  }
  return null;
}

/** The five steps as a row of marks, so it's clear how far there is to go. */
function Progress({ step }: { step: number }) {
  return (
    <ol className="mb-5 flex items-center gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
      {STEPS.map((s, i) => (
        <li key={s} className="flex-1">
          <span className={cn("block h-1 rounded-full transition-colors", i <= step ? "bg-accent" : "bg-paper/[0.1]")} aria-hidden />
          <span className="sr-only">
            {s}
            {i === step ? " (this step)" : i < step ? " (done)" : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Five choices with words, none chosen to begin with. */
function RatingStep({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <p className="text-sm leading-relaxed text-paper/70">Overall, how has DoOrDie been for your preparation? There&apos;s no right answer.</p>
      <div role="radiogroup" aria-label="Your rating" className="mt-4 grid grid-cols-5 gap-2">
        {([1, 2, 3, 4, 5] as const).map((n) => {
          const on = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${n} out of 5: ${RATING_LABEL[n]}`}
              onClick={() => onChange(n)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-2xl border px-1 py-3 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
                on ? "border-accent bg-accent text-accent-fg shadow-accent" : "border-line bg-paper/[0.03] text-paper/70 hover:border-paper/25 hover:text-paper",
              )}
            >
              <span className="text-lg font-bold">{n}</span>
              <span className="text-[0.66rem] font-semibold leading-tight">{RATING_LABEL[n]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ExperienceStep({ d, set }: { d: Draft; set: (p: Partial<Draft>) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-paper/70">Answer what you like, in your own words. Every answer is optional.</p>
      <Field label="What problem were you trying to solve before using DoOrDie?" optional>
        <Textarea value={d.problemBefore} onChange={(e) => set({ problemBefore: e.target.value })} maxLength={REVIEW_LIMITS.problemBefore} className="min-h-[64px]" />
      </Field>
      <Field label="What has been most helpful?" optional>
        <Textarea value={d.useful} onChange={(e) => set({ useful: e.target.value })} maxLength={REVIEW_LIMITS.useful} className="min-h-[64px]" />
      </Field>
      <Field label="How has DoOrDie changed the way you organise your preparation, if at all?" optional>
        <Textarea value={d.changeNote} onChange={(e) => set({ changeNote: e.target.value })} maxLength={REVIEW_LIMITS.changeNote} className="min-h-[64px]" />
      </Field>
      <Field label="What should we improve?" optional hint="Only the team sees this. It's never published.">
        <Textarea value={d.suggestions} onChange={(e) => set({ suggestions: e.target.value })} maxLength={REVIEW_LIMITS.suggestions} className="min-h-[64px]" />
      </Field>
      <Field
        label="What would you tell another aspirant considering DoOrDie?"
        optional
        hint={`${d.body.trim().length} characters. Needed, at ${REVIEW_LIMITS.body[0]} or more, only if you let it appear on the website.`}
      >
        <Textarea value={d.body} onChange={(e) => set({ body: e.target.value })} maxLength={REVIEW_LIMITS.body[1]} className="min-h-[88px]" />
      </Field>
    </div>
  );
}

function FeaturesStep({ d, set }: { d: Draft; set: (p: Partial<Draft>) => void }) {
  return (
    <div>
      <p className="text-sm leading-relaxed text-paper/70">
        Which have you actually used? Pick as many as apply. Features with records you made are marked as verified when the
        review is published.
      </p>
      <div role="group" aria-label="Features you used" className="mt-4 flex flex-wrap gap-2">
        {REVIEW_FEATURES.map((f) => {
          const on = d.features.includes(f);
          return (
            <Chip key={f} type="button" active={on} aria-pressed={on} onClick={() => set({ features: on ? d.features.filter((x) => x !== f) : [...d.features, f] })}>
              {featureLabel(f)}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}

function AboutStep({ d, set }: { d: Draft; set: (p: Partial<Draft>) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-paper/70">All optional, and only what you choose to say. Nothing here comes from your records.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Where you are in your preparation" optional>
          <Select value={d.stage} onChange={(e) => set({ stage: e.target.value as ReviewStage | "" })}>
            <option value="">Rather not say</option>
            {REVIEW_STAGE.ids.map((s) => (
              <option key={s} value={s}>
                {REVIEW_STAGE.label[s]}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <p className="mb-2 text-[0.78rem] font-semibold tracking-snugg text-paper/60">
            Full time or working <span className="ml-1.5 font-normal text-paper/45">Optional</span>
          </p>
          <Segmented
            label="Full time or working"
            options={[
              { value: "", label: "Rather not say" },
              { value: "full_time", label: "Full time" },
              { value: "working", label: "Working" },
            ]}
            value={d.aspirantType}
            onChange={(v) => set({ aspirantType: v as AspirantType | "" })}
          />
        </div>
      </div>
      <Field label="A headline" optional hint="A line that sums it up.">
        <Input value={d.headline} onChange={(e) => set({ headline: e.target.value })} maxLength={REVIEW_LIMITS.headline[1]} placeholder="Finally, one place for my whole preparation" />
      </Field>
      <div>
        <p className="mb-2 text-[0.78rem] font-semibold tracking-snugg text-paper/60">Name shown with it</p>
        <div role="radiogroup" aria-label="Name shown with it" className="grid gap-2 sm:grid-cols-3">
          {DISPLAY_PREFERENCE.ids.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={d.displayPreference === p}
              onClick={() => set({ displayPreference: p })}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                d.displayPreference === p ? "border-accent bg-accent/[0.08] text-paper" : "border-line text-paper/70 hover:border-paper/25",
              )}
            >
              {DISPLAY_PREFERENCE.label[p]}
            </button>
          ))}
        </div>
        {d.displayPreference !== "anonymous" && (
          <Field
            label="Your name"
            className="mt-3"
            hint={d.displayPreference === "initials" ? `Shown as “${publicReviewName(d.displayName, "initials")}”.` : "A first name is enough."}
          >
            <Input value={d.displayName} onChange={(e) => set({ displayName: e.target.value })} maxLength={REVIEW_LIMITS.name[1]} autoComplete="off" />
          </Field>
        )}
      </div>
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm text-paper">Show that I&apos;ve been a member for a while</p>
          <p id="review-tenure-hint" className="mt-0.5 text-xs leading-relaxed text-paper/55">
            Adds an &ldquo;Established member&rdquo; badge if your account is a few months old. Never your exact join date.
          </p>
        </div>
        <Switch label="Show that I've been a member for a while" describedBy="review-tenure-hint" checked={d.showTenure} onChange={(v) => set({ showTenure: v })} />
      </div>
    </div>
  );
}

/** What the website would show: the same card visitors see. Badges other than the first are worked out at publication. */
function previewOf(d: Draft): PublicReview {
  const t = (s: string) => s.trim() || null;
  return {
    slug: "preview",
    rating: d.rating || 1,
    headline: t(d.headline),
    body: t(d.body),
    useful: t(d.useful),
    problemBefore: t(d.problemBefore),
    changeNote: t(d.changeNote),
    features: d.features,
    stage: d.stage || null,
    aspirantType: d.aspirantType || null,
    displayName: publicReviewName(d.displayName, d.displayPreference),
    badges: { verifiedUser: true, activeUser: false, features: [], established: false },
    publishedAt: new Date().toISOString(),
    response: null,
    responseAt: null,
    featured: false,
    story: false,
  };
}

function Choice({
  id,
  icon: Icon,
  title,
  body,
  checked,
  onChange,
}: {
  id: string;
  icon: React.ElementType;
  title: string;
  body: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors",
        checked ? "border-accent bg-accent/[0.06]" : "border-line hover:border-paper/25",
      )}
    >
      <input id={id} type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-semibold text-paper">
          <Icon className="h-4 w-4 text-accent" aria-hidden /> {title}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-paper/65">{body}</span>
      </span>
    </label>
  );
}

function SharingStep({ d, set, live }: { d: Draft; set: (p: Partial<Draft>) => void; live: boolean }) {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-paper/70">Two separate permissions. You can change either later, in Settings.</p>
      <Choice
        id="review-private"
        icon={Lock}
        title="Private product feedback"
        body="Shared with the DoOrDie team only, to improve the product. Needed to send it. On its own this never puts anything on the website."
        checked={d.feedbackConsent}
        onChange={(v) => set({ feedbackConsent: v })}
      />
      <Choice
        id="review-public"
        icon={Globe}
        title="Public student testimonial"
        body={
          <>
            Also let it appear on the DoOrDie website after a moderator checks it for spam and abuse. Public: your rating, the
            headline, your answers except &ldquo;What should we improve?&rdquo;, the features, your stage and the name you chose,
            with badges worked out from your records. Never your email, your records or anything else. You can take it down at any
            time, and it comes down at once.
          </>
        }
        checked={d.publicConsent}
        onChange={(v) => set({ publicConsent: v })}
      />
      {d.publicConsent && (
        <div className="pt-2">
          <p className="eyebrow mb-2">How it would look</p>
          <TestimonialCard review={previewOf(d)} headingLevel={2} />
          <p className="mt-2 text-[0.7rem] leading-relaxed text-paper/50">
            The other badges are added when it&apos;s published, if your records support them.
          </p>
        </div>
      )}
      {live && (
        <p className="rounded-xl border border-warning/35 bg-warning/10 px-3.5 py-2.5 text-xs leading-relaxed text-paper/80">
          Your review is on the website. Changing what&apos;s shown there sends it back to a moderator; until they&apos;ve looked,
          the website keeps the version they approved (or takes it down, if the team has chosen that).
        </p>
      )}
    </div>
  );
}

/**
 * Writing or editing a review, in five short steps: rating, experience,
 * features, optional context, and the two permissions. Nothing is filled in
 * from the student's records, and nothing is preselected that they didn't choose.
 */
export function ReviewWizard({
  open,
  initial,
  defaultName,
  source,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: AuthorReview | null;
  defaultName: string;
  source: "settings" | "invitation";
  onClose: () => void;
  onSaved: (review: AuthorReview) => void;
}) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(() => draftFrom(initial, defaultName));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<Draft>) => {
    setD((x) => ({ ...x, ...p }));
    setError(null);
  };

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setD(draftFrom(initial, defaultName));
    setError(null);
  }, [open, initial, defaultName]);

  const last = step === STEPS.length - 1;

  function next() {
    const p = problemAt(step, d);
    if (p) return setError(p);
    setError(null);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  async function send() {
    for (let i = 0; i < STEPS.length; i++) {
      const p = problemAt(i, d);
      if (p) {
        setStep(i);
        return setError(p);
      }
    }
    setBusy(true);
    setError(null);
    const t = (s: string) => s.trim() || null;
    try {
      const saved = await apiCall<AuthorReview>("/api/reviews", {
        method: "POST",
        body: {
          rating: d.rating,
          headline: t(d.headline),
          body: t(d.body),
          useful: t(d.useful),
          suggestions: t(d.suggestions),
          problemBefore: t(d.problemBefore),
          changeNote: t(d.changeNote),
          features: d.features,
          stage: d.stage || null,
          aspirantType: d.aspirantType || null,
          displayName: d.displayPreference === "anonymous" ? "Anonymous" : d.displayName.trim(),
          displayPreference: d.displayPreference,
          showTenure: d.showTenure,
          feedbackConsent: d.feedbackConsent,
          publicConsent: d.publicConsent,
          consentVersion: REVIEW_CONSENT_VERSION,
          source,
        },
      });
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't send. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={initial && initial.status !== "withdrawn" ? "Edit your review" : "Review DoOrDie"}
      description={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}
      className="sm:max-w-xl"
      footer={
        <>
          {step > 0 ? (
            <Button variant="ghost" onClick={() => (setError(null), setStep((s) => s - 1))} disabled={busy}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
          )}
          {last ? (
            <Button onClick={() => void send()} disabled={busy}>
              <Send className="h-4 w-4" aria-hidden /> {busy ? "Sending…" : initial && initial.status !== "withdrawn" ? "Save changes" : "Send review"}
            </Button>
          ) : (
            <Button onClick={next} disabled={step === 0 && d.rating < 1}>
              Next <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </>
      }
    >
      <Progress step={step} />
      {step === 0 && <RatingStep value={d.rating} onChange={(rating) => set({ rating })} />}
      {step === 1 && <ExperienceStep d={d} set={set} />}
      {step === 2 && <FeaturesStep d={d} set={set} />}
      {step === 3 && <AboutStep d={d} set={set} />}
      {step === 4 && <SharingStep d={d} set={set} live={Boolean(initial?.live)} />}
      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}
    </Modal>
  );
}
