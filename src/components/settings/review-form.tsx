"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { apiCall } from "@/lib/platform/client";
import { REVIEW_FEATURES, REVIEW_LIMITS, REVIEW_STAGE, featureLabel } from "@/lib/platform/content";
import type { AuthorReview } from "@/lib/platform/types";
import { Button } from "@/components/ui/button";
import { Field, Input, RatingPicker, Select, Textarea } from "@/components/ui/form";
import { Chip } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";

const RATING_WORDS = ["Poor", "Fair", "Good", "Very good", "Excellent"];

function Consent({ id, title, hint, checked, onChange }: { id: string; title: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm text-paper">{title}</p>
        <p id={id} className="mt-0.5 text-xs leading-relaxed text-paper/55">
          {hint}
        </p>
      </div>
      <Switch label={title} describedBy={id} checked={checked} onChange={onChange} />
    </div>
  );
}

/** What's wrong with the form, in the same terms the database uses, or null. */
function problem(f: { rating: number; body: string; headline: string; name: string; feedbackConsent: boolean }): string | null {
  if (f.rating < 1) return "Choose a rating from 1 to 5.";
  const body = f.body.trim().length;
  if (body < REVIEW_LIMITS.body[0]) return `Write at least ${REVIEW_LIMITS.body[0]} characters in your review.`;
  if (body > REVIEW_LIMITS.body[1]) return `Keep your review under ${REVIEW_LIMITS.body[1].toLocaleString()} characters.`;
  const headline = f.headline.trim().length;
  if (headline && (headline < REVIEW_LIMITS.headline[0] || headline > REVIEW_LIMITS.headline[1])) return "Keep the headline between 3 and 80 characters.";
  const name = f.name.trim().length;
  if (name < REVIEW_LIMITS.name[0] || name > REVIEW_LIMITS.name[1]) return "Choose a name of 2 to 40 characters to show with it.";
  if (!f.feedbackConsent) return "Agree to the team reading your review to send it.";
  return null;
}

/**
 * Writing or editing a review. Nothing is filled in from the person's
 * records: the features they used are theirs to tick, and the name shown
 * with it is theirs to choose.
 */
export function ReviewForm({
  initial,
  defaultName,
  onSaved,
  onCancel,
}: {
  initial: AuthorReview | null;
  defaultName: string;
  onSaved: (review: AuthorReview) => void;
  onCancel?: () => void;
}) {
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [headline, setHeadline] = useState(initial?.headline ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [useful, setUseful] = useState(initial?.useful ?? "");
  const [suggestions, setSuggestions] = useState(initial?.suggestions ?? "");
  const [features, setFeatures] = useState<string[]>(initial?.features ?? []);
  const [stage, setStage] = useState<string>(initial?.stage ?? "");
  const [name, setName] = useState(initial?.displayName ?? defaultName);
  const [feedbackConsent, setFeedbackConsent] = useState(initial?.feedbackConsent ?? false);
  const [publicConsent, setPublicConsent] = useState(initial?.publicConsent ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = initial?.status === "published";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = problem({ rating, body, headline, name, feedbackConsent });
    if (p) return setError(p);
    setBusy(true);
    setError(null);
    try {
      const saved = await apiCall<AuthorReview>("/api/reviews", {
        method: "POST",
        body: {
          rating,
          headline: headline.trim() || null,
          body: body.trim(),
          useful: useful.trim() || null,
          suggestions: suggestions.trim() || null,
          features,
          stage: stage || null,
          displayName: name.trim(),
          feedbackConsent,
          publicConsent,
        },
      });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't send. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
      <Field label="Your rating">
        <div role="group" aria-label="Rating, 1 to 5">
          <RatingPicker value={rating} onChange={setRating} labels={RATING_WORDS} />
        </div>
      </Field>
      <Field label="Headline" optional hint="A line that sums it up.">
        <Input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={REVIEW_LIMITS.headline[1]} placeholder="Finally, one place for my whole preparation" />
      </Field>
      <Field label="Your review" hint={`${body.trim().length.toLocaleString()} of ${REVIEW_LIMITS.body[1].toLocaleString()} characters, at least ${REVIEW_LIMITS.body[0]}.`}>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={REVIEW_LIMITS.body[1]}
          className="min-h-[120px]"
          placeholder="What DoOrDie is like to use day to day, honestly. Criticism is as welcome as praise."
        />
      </Field>
      <Field label="What was most useful" optional>
        <Textarea value={useful} onChange={(e) => setUseful(e.target.value)} maxLength={REVIEW_LIMITS.useful} className="min-h-[72px]" />
      </Field>
      <Field label="Suggestions for the team" optional hint="Only the team sees this. It's never published.">
        <Textarea value={suggestions} onChange={(e) => setSuggestions(e.target.value)} maxLength={REVIEW_LIMITS.suggestions} className="min-h-[72px]" />
      </Field>
      <div>
        <p className="mb-2 text-[0.78rem] font-semibold tracking-snugg text-paper/60">
          Features you used <span className="ml-1.5 font-normal text-paper/45">Optional</span>
        </p>
        <div role="group" aria-label="Features you used" className="flex flex-wrap gap-2">
          {REVIEW_FEATURES.map((f) => {
            const on = features.includes(f);
            return (
              <Chip key={f} type="button" active={on} aria-pressed={on} onClick={() => setFeatures((list) => (on ? list.filter((x) => x !== f) : [...list, f]))}>
                {featureLabel(f)}
              </Chip>
            );
          })}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Where you are in your preparation" optional>
          <Select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">Rather not say</option>
            {REVIEW_STAGE.ids.map((s) => (
              <option key={s} value={s}>
                {REVIEW_STAGE.label[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name to show with it" hint="A first name or initials is enough.">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={REVIEW_LIMITS.name[1]} autoComplete="off" />
        </Field>
      </div>

      <div className="divide-y divide-line rounded-2xl border border-line px-4">
        <Consent
          id="review-feedback-consent"
          title="The team may read it"
          hint="Needed to send it: the team reads every review to improve DoOrDie. On its own, this never puts your review on the website."
          checked={feedbackConsent}
          onChange={setFeedbackConsent}
        />
        <Consent
          id="review-public-consent"
          title="It may appear on the website"
          hint="With the name above, once a moderator has checked it isn't spam or abuse. Turn this off whenever you like and it comes down."
          checked={publicConsent}
          onChange={setPublicConsent}
        />
      </div>

      {live && (
        <p className="rounded-xl border border-warning/35 bg-warning/10 px-3.5 py-2.5 text-xs leading-relaxed text-paper/80">
          Your review is on the website. Changing what&apos;s shown there sends it back to a moderator, and it comes down until they&apos;ve
          looked again. Changing only your suggestions doesn&apos;t.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy}>
          <Send className="h-4 w-4" aria-hidden />
          {busy ? "Sending…" : initial && initial.status !== "withdrawn" ? "Save changes" : "Send review"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
