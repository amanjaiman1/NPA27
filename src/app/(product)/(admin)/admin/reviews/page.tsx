"use client";

import { useState } from "react";
import { Check, CheckCircle2, EyeOff, Globe, Lock, MessageSquareReply, Star, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure, Segmented } from "@/components/ui/misc";
import { Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { AdminHeader, ErrorPanel, HistoryList, LoadingRows, Pager, ReasonDialog, Stars, When, ago } from "@/components/admin/ui";
import { adminApi, useAdmin } from "@/lib/platform/client";
import { REVIEW_STAGE, REVIEW_STATUS, featureLabel, type ReviewStatus } from "@/lib/platform/content";
import type { AdminReview, ReviewList } from "@/lib/platform/types";
import { cn } from "@/lib/utils";

const TABS: (ReviewStatus | "all")[] = ["pending", "published", "approved", "rejected", "hidden", "withdrawn", "all"];
const TAB_LABEL: Record<ReviewStatus | "all", string> = {
  pending: "Waiting",
  published: "Published",
  approved: "Approved privately",
  rejected: "Rejected",
  hidden: "Hidden",
  withdrawn: "Withdrawn",
  all: "All",
};
const STATUS_TONE: Record<ReviewStatus, "warning" | "positive" | "accent" | "danger" | "ghost" | "outline"> = {
  pending: "warning",
  published: "positive",
  approved: "accent",
  rejected: "danger",
  hidden: "outline",
  withdrawn: "ghost",
};
/** Features whose use the app can see in the records: the usage check confirms these. */
const CHECKABLE = new Set(["journal", "life", "revision", "habits", "mocks", "roadmap"]);
const LIMIT = 20;

export default function AdminReviewsPage() {
  const [tab, setTab] = useState<ReviewStatus | "all">("pending");
  const [offset, setOffset] = useState(0);
  const list = useAdmin<ReviewList>(`reviews?status=${tab}&limit=${LIMIT}&offset=${offset}`);
  const counts = list.data?.counts ?? {};
  const total = Object.values(counts).reduce((s, v) => s + (v ?? 0), 0);

  return (
    <div className="space-y-6">
      <AdminHeader
        icon={Star}
        title="Reviews"
        description="What students wrote about DoOrDie, with their consent and a check of how long they've used it. Only published reviews appear on the website."
      />
      <Card className="p-5">
        <Disclosure summary="Moderation rules">
          <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-paper/65">
            <li>Publish honest reviews, including critical ones. A low rating or a complaint is never a reason to reject.</li>
            <li>Reject or hide only for: personal details (a phone number, someone else&apos;s name), abuse, spam or advertising, or text that isn&apos;t about DoOrDie. Say why: the author sees the reason.</li>
            <li>Never edit what someone wrote. You can add a public response, shown under the review.</li>
            <li>A review without consent to publish can only be approved privately. If the author withdraws consent, it leaves the website at once.</li>
          </ul>
        </Disclosure>
      </Card>
      <Segmented
        label="Review status"
        compact
        options={TABS.map((t) => ({
          value: t,
          label: `${TAB_LABEL[t]}${t === "all" ? (total ? ` · ${total}` : "") : counts[t] ? ` · ${counts[t]}` : ""}`,
        }))}
        value={tab}
        onChange={(v) => {
          setTab(v);
          setOffset(0);
        }}
      />
      <ErrorPanel error={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? (
        <LoadingRows />
      ) : list.data && !list.data.items.length ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-medium text-paper">{tab === "pending" ? "Nothing is waiting." : "No reviews here."}</p>
          <p className="mt-1 text-xs text-paper/55">New reviews appear under Waiting as students send them.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {list.data?.items.map((r) => <ReviewCard key={r.id} review={r} onChanged={list.reload} />)}
        </div>
      )}
      {list.data && <Pager total={list.data.total} limit={list.data.limit} offset={list.data.offset} onChange={setOffset} />}
    </div>
  );
}

function ReviewCard({ review: r, onChanged }: { review: AdminReview; onChanged: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<"reject" | "hide" | null>(null);
  const [response, setResponse] = useState(r.response ?? "");
  const u = r.usage;

  async function moderate(action: "publish" | "approve" | "reject" | "hide", reason?: string) {
    setBusy(true);
    try {
      await adminApi.post(`reviews/${r.id}/moderate`, { action, reason: reason ?? null, seen: r.submittedAt });
      toast({ title: action === "publish" ? "Published on the website" : action === "approve" ? "Approved privately" : action === "reject" ? "Rejected" : "Taken off the website" });
      onChanged();
    } catch (e) {
      toast({ title: "Not changed", description: e instanceof Error ? e.message : undefined, tone: "error" });
      if (reason !== undefined) throw e;
    } finally {
      setBusy(false);
    }
  }

  async function saveResponse(text: string | null) {
    setBusy(true);
    try {
      await adminApi.put(`reviews/${r.id}/response`, { response: text });
      toast({ title: text ? "Response saved" : "Response removed" });
      onChanged();
    } catch (e) {
      toast({ title: "Not saved", description: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Stars value={r.rating} />
            <Badge tone={STATUS_TONE[r.status]}>{REVIEW_STATUS.label[r.status]}</Badge>
          </div>
          {r.headline && <h2 className="mt-2 text-base font-semibold tracking-snugg text-paper">{r.headline}</h2>}
          <p className="mt-1 text-xs text-paper/55">
            {r.displayName}
            {r.stage ? ` · ${REVIEW_STAGE.label[r.stage]}` : ""} · sent {ago(r.submittedAt)}
          </p>
        </div>
      </div>

      <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-paper/85">{r.body}</p>
      {r.useful && (
        <p className="mt-3 text-sm leading-relaxed text-paper/75">
          <span className="font-semibold text-paper">Most useful: </span>
          {r.useful}
        </p>
      )}
      {r.suggestions && (
        <div className="mt-3 rounded-xl border border-dashed border-line bg-paper/[0.02] px-3.5 py-2.5 text-sm text-paper/75">
          <p className="mb-1 flex items-center gap-1.5 text-[0.7rem] font-semibold text-paper/55">
            <Lock className="h-3 w-3" aria-hidden /> Suggestions, private: never published
          </p>
          <p className="whitespace-pre-line">{r.suggestions}</p>
        </div>
      )}
      {r.features.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Features the author says they used">
          {r.features.map((f) => {
            const checked = CHECKABLE.has(f);
            const seen = u.features.includes(f);
            return (
              <li key={f}>
                <Badge tone={checked ? (seen ? "positive" : "warning") : "outline"} title={checked ? (seen ? "Records found" : "No records found for this") : "Can't be checked from records"}>
                  {checked && seen && <Check className="mr-1 h-3 w-3" aria-hidden />}
                  {featureLabel(f)}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-line bg-paper/[0.02] p-4 text-xs leading-relaxed">
          <p className="mb-1.5 font-semibold text-paper">Usage check, when sent</p>
          <p className="text-paper/70">
            Records on <strong className="text-paper">{u.usageDays}</strong> {u.usageDays === 1 ? "day" : "days"}, the first{" "}
            {u.firstUseOn ? (
              <>
                on <When at={`${u.firstUseOn}T00:00:00`} date /> ({u.daysSinceFirstUse} days before)
              </>
            ) : (
              "not found"
            )}
            .
          </p>
          <p className="mt-1 text-paper/60">
            {r.account?.emailConfirmed ? "Email confirmed" : "Email not confirmed"}; account created{" "}
            <When at={r.account?.createdAt} date fallback="unknown" />. Counted from dates only, never from what was written.
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-paper/[0.02] p-4 text-xs leading-relaxed">
          <p className="mb-1.5 font-semibold text-paper">Consent</p>
          <p className={cn("flex items-center gap-1.5", r.publicConsent ? "text-positive" : "text-paper/65")}>
            {r.publicConsent ? <Globe className="h-3.5 w-3.5" aria-hidden /> : <Lock className="h-3.5 w-3.5" aria-hidden />}
            {r.publicConsent ? (
              <>
                May be published, agreed <When at={r.publicConsentAt} date />
              </>
            ) : (
              "Not for the website: can only be approved privately"
            )}
          </p>
          <p className="mt-1 text-paper/60">
            The team may read it, agreed <When at={r.feedbackConsentAt} date />.
          </p>
        </div>
      </div>

      {r.moderationReason && (r.status === "rejected" || r.status === "hidden") && (
        <p className="mt-4 rounded-xl bg-danger/[0.06] px-3.5 py-2.5 text-xs text-paper/75">
          <span className="font-semibold text-danger">Reason given to the author: </span>
          {r.moderationReason}
        </p>
      )}

      {r.status !== "withdrawn" && (
        <div className="mt-5 flex flex-wrap gap-2">
          {r.status !== "published" && (
            <Button
              size="sm"
              onClick={() => void moderate("publish")}
              disabled={busy || !r.publicConsent}
              hint={r.publicConsent ? "Show it on the website, under the name the author chose." : "The author hasn't agreed to publish it."}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Publish
            </Button>
          )}
          {(r.status === "pending" || r.status === "rejected" || r.status === "hidden") && (
            <Button size="sm" variant="ghost" onClick={() => void moderate("approve")} disabled={busy} hint="Accept it without showing it on the website.">
              <Check className="h-4 w-4" aria-hidden /> Approve privately
            </Button>
          )}
          {(r.status === "pending" || r.status === "approved") && (
            <Button size="sm" variant="danger" onClick={() => setAsk("reject")} disabled={busy}>
              <XCircle className="h-4 w-4" aria-hidden /> Reject
            </Button>
          )}
          {r.status === "published" && (
            <Button size="sm" variant="danger" onClick={() => setAsk("hide")} disabled={busy}>
              <EyeOff className="h-4 w-4" aria-hidden /> Take off the website
            </Button>
          )}
        </div>
      )}

      {r.status !== "withdrawn" && (
        <div className="mt-5 border-t border-line pt-4">
          <Disclosure
            summary={
              <span className="inline-flex items-center gap-2">
                <MessageSquareReply className="h-4 w-4 text-paper/50" aria-hidden />
                {r.response ? "Public response" : "Add a public response"}
              </span>
            }
          >
            <div className="space-y-2">
              <Textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                maxLength={1000}
                placeholder="Thank you. A Hindi option is on the list."
                aria-label="Public response"
              />
              <p className="text-[0.7rem] text-paper/50">Shown under the review on the website, signed &ldquo;The DoOrDie team&rdquo;.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={busy || !response.trim() || response.trim() === (r.response ?? "")} onClick={() => void saveResponse(response.trim())}>
                  Save response
                </Button>
                {r.response && (
                  <Button size="sm" variant="subtle" disabled={busy} onClick={() => void saveResponse(null)}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </Disclosure>
          <Disclosure summary="Moderation history" className="mt-1">
            <HistoryOf id={r.id} />
          </Disclosure>
        </div>
      )}

      <ReasonDialog
        open={ask !== null}
        onClose={() => setAsk(null)}
        title={ask === "hide" ? "Take this review off the website?" : "Reject this review?"}
        description="Only for personal details, abuse, spam or text that isn't about DoOrDie, never for criticism. The author sees your reason."
        label="Reason for the author"
        confirmLabel={ask === "hide" ? "Take it off" : "Reject"}
        placeholder="It names another student."
        onConfirm={(reason) => moderate(ask ?? "reject", reason)}
      />
    </Card>
  );
}

/** Loaded when the history is opened: the disclosure mounts it only then. */
function HistoryOf({ id }: { id: string }) {
  const detail = useAdmin<AdminReview>(`reviews/${id}`);
  if (detail.error) return <p className="text-xs text-danger">{detail.error.message}</p>;
  if (!detail.data) return <p className="text-xs text-paper/50">Loading…</p>;
  return <HistoryList entries={detail.data.history} empty="No moderator has acted on this yet." />;
}
