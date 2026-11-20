"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Check,
  CheckCircle2,
  EyeOff,
  Globe,
  Lock,
  MessageSquareReply,
  PencilLine,
  RotateCcw,
  Sparkles,
  StarOff,
  UserRound,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/misc";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { HistoryList, Stars, When, ago } from "@/components/admin/ui";
import { useAdminActor } from "@/components/admin/admin-context";
import { adminApi, useAdmin } from "@/lib/platform/client";
import {
  ASPIRANT_TYPE,
  DISPLAY_PREFERENCE,
  MODERATION_CODE,
  REVIEW_STAGE,
  REVIEW_STATUS,
  featureLabel,
  type ModerationCode,
  type ReviewStatus,
} from "@/lib/platform/content";
import type { AdminReview } from "@/lib/platform/types";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<ReviewStatus, "warning" | "positive" | "accent" | "danger" | "ghost" | "outline"> = {
  pending: "warning",
  published: "positive",
  approved: "accent",
  rejected: "danger",
  hidden: "outline",
  withdrawn: "ghost",
};
/** Features whose use the database can see in the records: verification covers only these. */
const CHECKABLE = new Set(["journal", "life", "revision", "habits", "mocks", "roadmap"]);
const CONSENT_WORD = {
  feedback_granted: "Allowed the team to read it",
  public_granted: "Allowed it on the website",
  public_withdrawn: "Took back permission for the website",
  review_withdrawn: "Withdrew the review",
} as const;

type Action = "publish" | "approve" | "reject" | "hide" | "restore" | "feature" | "unfeature";
const DONE: Record<Action, string> = {
  publish: "Published on the website",
  approve: "Approved privately",
  reject: "Rejected",
  hide: "Taken off the website",
  restore: "Restored to the website",
  feature: "Featured on the reviews page",
  unfeature: "No longer featured",
};

function Answer({ label, text, private: isPrivate = false }: { label: string; text: string | null; private?: boolean }) {
  if (!text) return null;
  return (
    <div className={cn("mt-3 text-sm leading-relaxed", isPrivate ? "rounded-xl border border-dashed border-line bg-paper/[0.02] px-3.5 py-2.5 text-paper/75" : "text-paper/80")}>
      <p className={cn("mb-0.5 text-[0.7rem] font-semibold", isPrivate ? "flex items-center gap-1.5 text-paper/55" : "text-paper/55")}>
        {isPrivate && <Lock className="h-3 w-3" aria-hidden />}
        {label}
      </p>
      <p className="whitespace-pre-line break-words">{text}</p>
    </div>
  );
}

/** Rejecting or hiding: one of the listed reasons, and a note the author sees if you add one. */
function ReasonDialog({
  action,
  onClose,
  onConfirm,
}: {
  action: "reject" | "hide" | null;
  onClose: () => void;
  onConfirm: (code: ModerationCode, note: string) => Promise<void>;
}) {
  const [code, setCode] = useState<ModerationCode | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!code) return setError("Choose the reason.");
    setBusy(true);
    setError(null);
    try {
      await onConfirm(code, note.trim());
      setCode("");
      setNote("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={action !== null}
      onClose={() => !busy && onClose()}
      title={action === "hide" ? "Take this review off the website?" : "Reject this review?"}
      description="Only for one of these reasons, never because it's critical. The author sees the reason and your note."
      className="sm:max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void confirm()} disabled={busy}>
            {busy ? "Saving…" : action === "hide" ? "Take it off" : "Reject"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Reason" error={error}>
          <Select value={code} onChange={(e) => setCode(e.target.value as ModerationCode)} data-autofocus>
            <option value="">Choose…</option>
            {MODERATION_CODE.ids.map((c) => (
              <option key={c} value={c}>
                {MODERATION_CODE.label[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note for the author" optional hint="What to change if they'd like to send it again. Kept in the audit log.">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="It names another student. Remove the name and send it again." />
        </Field>
      </div>
    </Modal>
  );
}

/** Loaded when opened: the moderation trail, consent history and earlier versions. */
function Details({ id }: { id: string }) {
  const detail = useAdmin<AdminReview>(`reviews/${id}`);
  if (detail.error) return <p className="text-xs text-danger">{detail.error.message}</p>;
  if (!detail.data) return <p className="text-xs text-paper/50">Loading…</p>;
  const d = detail.data;
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <section>
        <p className="eyebrow mb-2">Moderation history</p>
        <HistoryList entries={d.history} empty="No moderator has acted on this yet." />
      </section>
      <section>
        <p className="eyebrow mb-2">Consent history</p>
        {d.consentHistory?.length ? (
          <ol className="space-y-2 text-xs">
            {d.consentHistory.map((e, i) => (
              <li key={i} className="rounded-xl border border-line bg-paper/[0.02] px-3.5 py-2.5">
                <p className="font-semibold text-paper">{CONSENT_WORD[e.kind]}</p>
                <p className="mt-0.5 text-paper/55">
                  <When at={e.at} />
                  {e.version ? ` · wording of ${e.version}` : ""}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-paper/50">Recorded from this version of the Admin Center on.</p>
        )}
      </section>
      <section>
        <p className="eyebrow mb-2">Earlier versions</p>
        {d.revisions?.length ? (
          <ol className="space-y-2 text-xs">
            {d.revisions.map((v) => (
              <li key={v.id} className="rounded-xl border border-line bg-paper/[0.02] px-3.5 py-2.5">
                <p className="font-semibold text-paper">
                  Replaced <When at={v.at} /> · was {REVIEW_STATUS.label[v.status]?.toLowerCase() ?? v.status}
                </p>
                <p className="mt-1 text-paper/60">
                  {String(v.content.rating ?? "?")}★ {v.content.headline ? `“${String(v.content.headline)}” · ` : ""}
                  {String(v.content.body ?? v.content.useful ?? "").slice(0, 160)}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-paper/50">Not edited since it was sent.</p>
        )}
      </section>
    </div>
  );
}

/** After the author's edit arrives on screen, how long the decisions wait, so a click meant for the old version can't land on the new one. */
const READ_FIRST_MS = 2_500;

export function ReviewCard({ review: r, onChanged }: { review: AdminReview; onChanged: () => void }) {
  const toast = useToast();
  const { can } = useAdminActor();
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<"reject" | "hide" | null>(null);
  const [response, setResponse] = useState(r.response ?? "");
  const u = r.usage;
  const canHide = can("reviews.hide");

  // The official response saved elsewhere (another moderator, live) replaces the box's text
  // only while nobody is writing in it.
  const savedResponse = useRef(r.response ?? "");
  useEffect(() => {
    const next = r.response ?? "";
    setResponse((text) => (text === savedResponse.current ? next : text));
    savedResponse.current = next;
  }, [r.response]);

  // The author sent a new version while this card was open (a live update): say so, and hold the
  // decisions for a moment. What a moderator approves is always the version on screen.
  const shownVersion = useRef(r.submittedAt);
  const [editedLive, setEditedLive] = useState(false);
  const [readFirst, setReadFirst] = useState(false);
  useEffect(() => {
    if (r.submittedAt === shownVersion.current) return;
    shownVersion.current = r.submittedAt;
    setEditedLive(true);
    setReadFirst(true);
    // A reason being written was for the version that's gone.
    setAsk(null);
    const timer = setTimeout(() => setReadFirst(false), READ_FIRST_MS);
    return () => clearTimeout(timer);
  }, [r.submittedAt]);
  const holding = busy || readFirst;

  async function moderate(action: Action, code?: ModerationCode, note?: string) {
    setBusy(true);
    try {
      await adminApi.post(`reviews/${r.id}/moderate`, { action, code: code ?? null, reason: note || null, seen: r.submittedAt });
      toast({ title: DONE[action] });
      onChanged();
    } catch (e) {
      toast({ title: "Not changed", description: e instanceof Error ? e.message : undefined, tone: "error" });
      if (code) throw e;
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

  const waitingWhileLive = r.live && r.status === "pending";
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Stars value={r.rating} />
            <Badge tone={STATUS_TONE[r.status]}>{REVIEW_STATUS.label[r.status]}</Badge>
            {r.live && <Badge tone="positive"><Globe className="mr-1 h-3 w-3" aria-hidden />Live</Badge>}
            {r.featuredAt && r.live && <Badge tone="accent"><Sparkles className="mr-1 h-3 w-3" aria-hidden />Featured</Badge>}
            <Badge tone="outline">{r.source === "invitation" ? "From the invitation" : "From Settings"}</Badge>
          </div>
          {r.headline && <h2 className="mt-2 text-base font-semibold tracking-snugg text-paper">{r.headline}</h2>}
          <p className="mt-1 text-xs text-paper/55">
            {r.displayName}
            {r.displayPreference !== "name" ? ` (shown as “${r.publicName}”: ${DISPLAY_PREFERENCE.label[r.displayPreference].toLowerCase()})` : ""}
            {r.stage ? ` · ${REVIEW_STAGE.label[r.stage]}` : ""}
            {r.aspirantType ? ` · ${ASPIRANT_TYPE.label[r.aspirantType]}` : ""} · sent {ago(r.submittedAt)}
          </p>
        </div>
        {can("users.read") && (
          <Link href={`/admin/users?id=${r.userId}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline">
            <UserRound className="h-3.5 w-3.5" aria-hidden /> Account details
          </Link>
        )}
      </div>

      {editedLive && (
        <p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/[0.06] px-3.5 py-2.5 text-xs leading-relaxed text-paper/80">
          <PencilLine className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
          <span>
            <span className="font-semibold text-paper">Edited just now.</span> The author sent a new version while you had this open. What you see is
            that version; read it before deciding.
          </span>
        </p>
      )}
      {waitingWhileLive && (
        <p className="mt-4 rounded-xl border border-warning/35 bg-warning/10 px-3.5 py-2.5 text-xs leading-relaxed text-paper/80">
          The author edited this. The website still shows the version you approved; this new one replaces it once you publish it.
        </p>
      )}
      <Answer label="Before DoOrDie, they were trying to solve" text={r.problemBefore} />
      <Answer label="Most helpful" text={r.useful} />
      <Answer label="How it changed their preparation" text={r.changeNote} />
      <Answer label="What they'd tell another aspirant" text={r.body} />
      <Answer label="What we should improve: private, never published" text={r.suggestions} private />

      {r.features.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Features the author says they used">
          {r.features.map((f) => {
            const checkable = CHECKABLE.has(f);
            const seen = r.badges.features.includes(f);
            return (
              <li key={f}>
                <Badge
                  tone={checkable ? (seen ? "positive" : "warning") : "outline"}
                  title={checkable ? (seen ? "Records found: verified" : "No records found for this") : "Leaves no dated records, so it can't be verified"}
                >
                  {checkable && seen && <Check className="mr-1 h-3 w-3" aria-hidden />}
                  {featureLabel(f)}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-line bg-paper/[0.02] p-4 text-xs leading-relaxed">
          <p className="mb-1.5 font-semibold text-paper">Verification evidence</p>
          <p className="text-paper/70">
            Records on <strong className="text-paper">{u.usageDays}</strong> {u.usageDays === 1 ? "day" : "days"}, the first{" "}
            {u.firstUseOn ? (
              <>
                on <When at={`${u.firstUseOn}T00:00:00`} date /> ({u.daysSinceFirstUse} days before it was sent)
              </>
            ) : (
              "not found"
            )}
            . {r.account?.emailConfirmed ? "Email confirmed" : "Email not confirmed"}; account created{" "}
            <When at={r.account?.createdAt} date fallback="unknown" />.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="accent">Verified user</Badge>
            {r.badges.activeUser && (
              <Badge tone="positive">
                <Activity className="mr-1 h-3 w-3" aria-hidden />
                Active user
              </Badge>
            )}
            {r.badges.established && <Badge tone="outline">Established member</Badge>}
          </div>
          <p className="mt-2 text-paper/50">Worked out from dates only, never from what anyone wrote. Not editable here.</p>
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
              "Private feedback: can only be approved privately"
            )}
          </p>
          <p className="mt-1 text-paper/60">
            The team may read it, agreed <When at={r.feedbackConsentAt} date />
            {r.consentVersion ? `, wording of ${r.consentVersion}` : ""}.
          </p>
          {r.showTenure && <p className="mt-1 text-paper/60">Chose to show how long they&apos;ve been a member.</p>}
        </div>
      </div>

      {r.moderationReason !== null || r.moderationCode ? (
        (r.status === "rejected" || r.status === "hidden") && (
          <p className="mt-4 rounded-xl bg-danger/[0.06] px-3.5 py-2.5 text-xs text-paper/75">
            <span className="font-semibold text-danger">Given to the author: </span>
            {r.moderationCode ? MODERATION_CODE.label[r.moderationCode] : "Reason"}
            {r.moderationReason ? `: ${r.moderationReason}` : ""}
          </p>
        )
      ) : null}

      {r.status !== "withdrawn" && (
        <div className="mt-5 flex flex-wrap gap-2">
          {(r.status !== "published" || !r.live) && r.status !== "hidden" && (
            <Button
              size="sm"
              onClick={() => void moderate("publish")}
              disabled={holding || !r.publicConsent}
              hint={r.publicConsent ? "Show this version on the website, under the name the author chose." : "Private feedback: the author hasn't agreed to publish it."}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden /> {waitingWhileLive ? "Publish this version" : "Approve and publish"}
            </Button>
          )}
          {(r.status === "pending" || r.status === "rejected" || r.status === "hidden") && (
            <Button size="sm" variant="ghost" onClick={() => void moderate("approve")} disabled={holding} hint="Accept it without showing it on the website.">
              <Check className="h-4 w-4" aria-hidden /> Approve privately
            </Button>
          )}
          {r.status === "hidden" && canHide && (
            <Button size="sm" variant="ghost" onClick={() => void moderate("restore")} disabled={holding || !r.publicConsent} hint="Put it back on the website.">
              <RotateCcw className="h-4 w-4" aria-hidden /> Restore
            </Button>
          )}
          {r.live && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void moderate(r.featuredAt ? "unfeature" : "feature")}
              disabled={holding}
              hint={r.featuredAt ? "Stop featuring it on the reviews page." : "Feature it at the top of the reviews page, for being detailed and useful."}
            >
              {r.featuredAt ? <StarOff className="h-4 w-4" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
              {r.featuredAt ? "Unfeature" : "Feature"}
            </Button>
          )}
          {(r.status === "pending" || r.status === "approved") && !r.live && (
            <Button size="sm" variant="danger" onClick={() => setAsk("reject")} disabled={holding}>
              <XCircle className="h-4 w-4" aria-hidden /> Reject
            </Button>
          )}
          {r.live && canHide && (
            <Button size="sm" variant="danger" onClick={() => setAsk("hide")} disabled={holding}>
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
                {r.response ? "Official response" : "Respond officially"}
              </span>
            }
          >
            <div className="space-y-2">
              <Textarea value={response} onChange={(e) => setResponse(e.target.value)} maxLength={1000} placeholder="Thank you. A Hindi option is on the list." aria-label="Official response" />
              <p className="text-[0.7rem] text-paper/50">Shown under the review on the website, signed &ldquo;The DoOrDie team&rdquo;. The author sees it too.</p>
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
        </div>
      )}
      <Disclosure summary="History, consent and earlier versions" className="mt-1">
        <Details id={r.id} />
      </Disclosure>

      <ReasonDialog action={ask} onClose={() => setAsk(null)} onConfirm={(code, note) => moderate(ask ?? "reject", code, note)} />
    </Card>
  );
}
