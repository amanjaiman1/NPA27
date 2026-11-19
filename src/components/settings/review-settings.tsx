"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Globe, MessageSquareReply, PenLine, Star } from "lucide-react";
import { useChronicle } from "@/lib/store";
import { apiCall, ApiError } from "@/lib/platform/client";
import { usePlatformUpdates } from "@/components/platform/live-updates";
import {
  RATING_LABEL,
  REVIEW_CONSENT_VERSION,
  REVIEW_LIMITS,
  REVIEW_STATUS,
  featureLabel,
  type ReviewStatus,
} from "@/lib/platform/content";
import type { AuthorReview, Eligibility, MyReview } from "@/lib/platform/types";
import { useAccount } from "@/components/account/account-session";
import { useInbox } from "@/components/platform/inbox";
import { BadgeRow, StarRow, reviewContext } from "@/components/marketing/review-card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { SettingsSection } from "./section";
import { ReviewWizard } from "./review-wizard";

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const when = (iso: string | null) => (iso ? day.format(new Date(iso)) : "");
// Consent versions are the date the sharing wording was last changed, e.g. "2026-11-19".
const utcDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const termsOf = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? utcDay.format(new Date(`${v}T00:00:00Z`)) : v);

const TONE: Record<ReviewStatus, "default" | "accent" | "positive" | "warning" | "danger" | "outline"> = {
  pending: "warning",
  published: "positive",
  approved: "accent",
  rejected: "danger",
  hidden: "danger",
  withdrawn: "outline",
};

function statusNote(r: AuthorReview): string {
  switch (r.status) {
    case "pending":
      if (r.live) return "Your change is waiting for a moderator. Until they've looked, the website keeps the version they approved.";
      return r.publicConsent
        ? "A moderator will look at it soon. They check for spam and abuse only: a review is never turned down for being critical."
        : "The team will read it. It stays off the website, because you haven't allowed that.";
    case "published":
      return "It's on the DoOrDie website.";
    case "approved":
      return r.publicConsent
        ? "A moderator has checked it. It isn't on the website at the moment."
        : "A moderator has checked it. It isn't on the website, because you haven't allowed that.";
    case "rejected":
      return "A moderator decided not to publish it.";
    case "hidden":
      return "A moderator took it off the website.";
    case "withdrawn":
      return "You withdrew it, so it's neither on the website nor with the moderators. You can send it again.";
  }
}

function Meter({ label, value, goal }: { label: string; value: number; goal: number }) {
  const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-paper/70">{label}</span>
        <span className="tabular font-semibold text-paper">
          {Math.min(value, goal)} of {goal}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper/[0.08]" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(value, goal)}>
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Not yet: how far along the account is, counted from the dates of its records. */
function NotYet({ e }: { e: Eligibility }) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-paper/70">
        Reviews open once you&apos;ve used DoOrDie for {e.minDays} days, with records on at least {e.minUsageDays} different days, so
        every review comes from real use.
      </p>
      <div className="space-y-3 rounded-2xl border border-line p-4">
        <Meter label="Days since your first record" value={e.daysSinceFirstUse} goal={e.minDays} />
        <Meter label="Days with records" value={e.usageDays} goal={e.minUsageDays} />
      </div>
      <p className="text-xs leading-relaxed text-paper/50">
        Counted from the dates of your journal, life, revision, habit, mock and roadmap records. What they say is never read.
      </p>
    </div>
  );
}

/** Each answer the author gave, under the question it answers. */
function Answers({ r }: { r: AuthorReview }) {
  const rows: [string, string | null][] = [
    ["What would you tell another aspirant?", r.body],
    ["Most helpful", r.useful],
    ["Before DoOrDie", r.problemBefore],
    ["What changed", r.changeNote],
    ["What should we improve? (only the team sees this)", r.suggestions],
  ];
  const given = rows.filter(([, v]) => v && v.trim());
  if (!given.length) return <p className="mt-2 text-sm text-paper/55">A rating, with no written answers.</p>;
  return (
    <dl className="mt-2 space-y-2.5">
      {given.map(([q, v]) => (
        <div key={q}>
          <dt className="text-[0.7rem] font-semibold uppercase tracking-wide text-paper/45">{q}</dt>
          <dd className="mt-0.5 line-clamp-4 whitespace-pre-line break-words text-sm leading-relaxed text-paper/75">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReviewSummary({ r }: { r: AuthorReview }) {
  const context = reviewContext(r);
  const rating = r.rating as 1 | 2 | 3 | 4 | 5;
  return (
    <div className="rounded-2xl border border-line p-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StarRow value={r.rating} size="sm" />
        <span className="text-xs font-semibold text-paper/70">{RATING_LABEL[rating]}</span>
        <span className="text-xs text-paper/50">
          · {r.publicName}
          {context ? ` · ${context}` : ""} · sent {when(r.submittedAt)}
        </span>
      </p>
      {r.headline && <p className="mt-2 text-sm font-semibold text-paper">{r.headline}</p>}
      <Answers r={r} />
      {r.features.length > 0 && <p className="mt-3 text-xs text-paper/50">Used: {r.features.map(featureLabel).join(", ")}</p>}
      {(r.status === "rejected" || r.status === "hidden") && r.moderationReason && (
        <p className="mt-3 rounded-xl bg-paper/[0.04] px-3 py-2 text-xs leading-relaxed text-paper/70">
          <span className="font-semibold text-paper">The moderator&apos;s reason:</span> {r.moderationReason}
        </p>
      )}
      {r.response && (
        <div className="mt-3 rounded-xl border border-accent/25 bg-accent/[0.06] px-3.5 py-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-accent">
            <MessageSquareReply className="h-3.5 w-3.5" aria-hidden /> The team&apos;s reply
            {r.responseAt && <span className="font-normal text-paper/50">{when(r.responseAt)}</span>}
          </p>
          <p className="mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-paper/80">{r.response}</p>
          <p className="mt-1.5 text-[0.7rem] text-paper/45">Shown under your review when it&apos;s on the website.</p>
        </div>
      )}
    </div>
  );
}

/** What visitors see right now, which may be an earlier version while an edit waits for a moderator. */
function OnTheWebsite({ r }: { r: AuthorReview }) {
  if (!r.live || !r.publicVersion) return null;
  const v = r.publicVersion;
  const earlier = r.status === "pending";
  return (
    <div className="rounded-2xl border border-positive/30 bg-positive/[0.06] p-4">
      <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-positive">
        <Globe className="h-3.5 w-3.5" aria-hidden />
        {earlier ? "The website shows the version approved earlier" : "On the website"}
        {r.publishedAt && <span className="font-normal text-paper/55">since {when(r.publishedAt)}</span>}
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-paper/60">
        <StarRow value={v.rating} size="sm" /> as {v.displayName}
        {v.headline ? ` · “${v.headline}”` : ""}
      </p>
      <BadgeRow badges={v.badges} className="mt-2.5" />
      <p className="mt-2.5 text-xs text-paper/55">
        <Link href="/reviews" className="font-semibold text-accent underline-offset-4 hover:underline">
          See it on the reviews page
        </Link>
      </p>
    </div>
  );
}

/**
 * The person's review of DoOrDie: whether they can write one yet, the
 * five-step form, where it stands, what the website shows, and their two
 * separate permissions (the team reading it, the website showing it),
 * either of which they can change later.
 */
export function ReviewSettings() {
  const { mode } = useAccount();
  const inbox = useInbox();
  const profileName = useChronicle((s) => s.profile.name);
  const confirm = useConfirm();
  const toast = useToast();
  const [data, setData] = useState<MyReview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "off" | "error">("loading");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (mode !== "cloud") return;
    let live = true;
    setState("loading");
    apiCall<MyReview>("/api/reviews")
      .then((d) => {
        if (!live) return;
        setData(d);
        setState("ready");
      })
      .catch((e: unknown) => live && setState(e instanceof ApiError && e.status === 503 ? "off" : "error"));
    return () => {
      live = false;
    };
  }, [mode, tick]);

  // A moderator decided or replied, or the review settings changed: show it without a reload.
  // Quietly, keeping what's shown if the call fails, and never under the person's hands.
  const quiet = useRef({ editing, busy });
  quiet.current = { editing, busy };
  usePlatformUpdates(
    ["reviews"],
    () => {
      if (quiet.current.editing || quiet.current.busy) return;
      void apiCall<MyReview>("/api/reviews").then(
        (d) => {
          if (quiet.current.editing || quiet.current.busy) return;
          setData(d);
          setState("ready");
        },
        () => undefined,
      );
    },
    mode === "cloud" && state === "ready",
  );

  // Reviews belong to accounts; without the platform's tables there's nothing to show.
  if (mode !== "cloud" || state === "off") return null;

  const review = data?.review ?? null;
  const setReview = (r: AuthorReview | null) => setData((d) => (d ? { ...d, review: r } : d));

  async function change(run: () => Promise<AuthorReview | null>, done: string) {
    setBusy(true);
    try {
      setReview(await run());
      toast({ title: done, tone: "success" });
    } catch (e) {
      toast({ title: "That didn't work", description: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function setPublic(on: boolean) {
    if (on && (review?.body?.trim().length ?? 0) < REVIEW_LIMITS.body[0]) {
      toast({
        title: "Add a little more first",
        description: `A public testimonial needs at least ${REVIEW_LIMITS.body[0]} characters in “What would you tell another aspirant?”. Edit your review to add it.`,
        tone: "error",
      });
      return;
    }
    void change(
      () => apiCall<AuthorReview>("/api/reviews", { method: "PATCH", body: { publicConsent: on, consentVersion: REVIEW_CONSENT_VERSION } }),
      on ? "The website may show your review" : "Your review is off the website",
    );
  }

  async function withdraw() {
    const ok = await confirm({
      title: "Withdraw your review?",
      description: "It comes off the website and out of the moderators' queue at once.",
      consequence: "You can send it again later.",
      confirmLabel: "Withdraw",
    });
    if (ok) await change(() => apiCall<AuthorReview>("/api/reviews?mode=withdraw", { method: "DELETE" }), "Review withdrawn");
  }

  async function remove() {
    const ok = await confirm({
      title: "Delete your review?",
      description: "It's removed for good, with the team's reply to it. Moderators keep only a record that they acted on it, never what it said.",
      confirmLabel: "Delete review",
      tone: "danger",
    });
    if (ok) await change(async () => (await apiCall("/api/reviews?mode=delete", { method: "DELETE" }), null), "Review deleted");
  }

  function saved(r: AuthorReview) {
    const wasLive = Boolean(review?.live);
    const edit = Boolean(review && review.status !== "withdrawn");
    setReview(r);
    setEditing(false);
    inbox?.answerInvite("done");
    toast({
      title: edit ? "Review updated" : "Review sent",
      description:
        wasLive && r.status === "pending"
          ? r.live
            ? "A moderator will look at the change. The website keeps the approved version until then."
            : "A moderator will look at the change. It's off the website until then."
          : "Thank you for writing it.",
      tone: "success",
    });
  }

  const firstName = profileName.trim().split(/\s+/)[0] ?? "";
  let content: React.ReactNode;
  if (state === "loading" || !data) {
    content =
      state === "error" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-paper/65">Your review couldn&apos;t be loaded.</p>
          <Button variant="ghost" size="sm" onClick={() => setTick((t) => t + 1)}>
            Try again
          </Button>
        </div>
      ) : (
        <Skeleton className="h-24 w-full rounded-2xl" />
      );
  } else if (!review) {
    content = !data.open ? (
      <p className="text-sm leading-relaxed text-paper/65">Reviews aren&apos;t open at the moment. Please come back later.</p>
    ) : !data.eligibility.eligible ? (
      <NotYet e={data.eligibility} />
    ) : (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-paper/70">
          You&apos;ve used DoOrDie long enough to say what it&apos;s like. Honest is what helps, good or bad. It takes about three minutes.
        </p>
        <Button onClick={() => setEditing(true)} className="shrink-0">
          <PenLine className="h-4 w-4" aria-hidden /> Write a review
        </Button>
      </div>
    );
  } else {
    content = (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={TONE[review.status]}>{REVIEW_STATUS.label[review.status]}</Badge>
          <p className="text-xs leading-relaxed text-paper/60">{statusNote(review)}</p>
        </div>
        <OnTheWebsite r={review} />
        <ReviewSummary r={review} />
        {review.status !== "withdrawn" && (
          <div className="divide-y divide-line rounded-2xl border border-line px-4">
            <div className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-paper">Public student testimonial</p>
                <p id="review-public-hint" className="mt-0.5 text-xs leading-relaxed text-paper/55">
                  {review.publicConsent
                    ? `Allowed since ${when(review.publicConsentAt)}${review.consentVersion ? `, under the sharing terms of ${termsOf(review.consentVersion)}` : ""}. Turn it off and it comes down at once.`
                    : "Off: only the team sees it. Turning it on sends it to a moderator first."}
                </p>
              </div>
              <Switch label="Public student testimonial" describedBy="review-public-hint" checked={review.publicConsent} onChange={setPublic} disabled={busy} />
            </div>
            <p className="py-3 text-xs leading-relaxed text-paper/55">
              Private product feedback: the team may read it, as you agreed on {when(review.feedbackConsentAt)}. To take that back,
              delete the review.
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} disabled={busy}>
            <PenLine className="h-3.5 w-3.5" aria-hidden /> {review.status === "withdrawn" ? "Edit and send again" : "Edit"}
          </Button>
          {review.status !== "withdrawn" && (
            <Button variant="ghost" size="sm" onClick={() => void withdraw()} disabled={busy}>
              Withdraw
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => void remove()} disabled={busy} className="text-danger">
            Delete
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SettingsSection
      id="review"
      icon={Star}
      title="Review DoOrDie"
      description="Tell the team, and if you like, other aspirants, what using DoOrDie is really like. Nothing is published without your say-so."
    >
      {content}
      {data && (
        <ReviewWizard
          open={editing}
          initial={review}
          defaultName={firstName}
          source="settings"
          onClose={() => setEditing(false)}
          onSaved={saved}
        />
      )}
    </SettingsSection>
  );
}
