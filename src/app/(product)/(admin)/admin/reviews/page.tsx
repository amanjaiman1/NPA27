"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Disclosure, Segmented } from "@/components/ui/misc";
import { Sparkline } from "@/components/charts/sparkline";
import { AdminHeader, ErrorPanel, LoadingRows, Pager, actionLabel, ago } from "@/components/admin/ui";
import { useAdmin } from "@/lib/platform/client";
import { MODERATION_CODE, type ReviewStatus } from "@/lib/platform/content";
import type { ReviewList } from "@/lib/platform/types";
import { ReviewCard } from "./review-card";

type Tab = ReviewStatus | "all" | "live" | "featured";
const TABS: Tab[] = ["pending", "live", "featured", "approved", "rejected", "hidden", "withdrawn", "all"];
const TAB_LABEL: Record<Tab, string> = {
  pending: "Waiting",
  live: "On the website",
  featured: "Featured",
  published: "Published",
  approved: "Approved privately",
  rejected: "Rejected",
  hidden: "Hidden",
  withdrawn: "Withdrawn",
  all: "All",
};
const LIMIT = 20;

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-paper/[0.02] px-4 py-3">
      <p className="tabular text-xl font-semibold text-paper">{value}</p>
      <p className="mt-0.5 text-xs text-paper/60">{label}</p>
      {hint && <p className="mt-1 text-[0.7rem] leading-snug text-paper/45">{hint}</p>}
    </div>
  );
}

export default function AdminReviewsPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const [offset, setOffset] = useState(0);
  const list = useAdmin<ReviewList>(`reviews?status=${tab}&limit=${LIMIT}&offset=${offset}`);
  const counts = list.data?.counts ?? {};
  const stats = list.data?.stats;
  const all = (["pending", "published", "approved", "rejected", "hidden", "withdrawn"] as ReviewStatus[]).reduce((s, k) => s + (counts[k] ?? 0), 0);

  return (
    <div className="space-y-6">
      <AdminHeader
        icon={Star}
        title="Reviews"
        description="What students wrote about DoOrDie, with their consent, the usage that made them eligible, and every decision taken on them. Only what's on the website is public."
      />
      {stats && (
        <Card className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.4fr)]">
          <Tile label="Waiting for a moderator" value={String(counts.pending ?? 0)} />
          <Tile label="On the website" value={String(counts.live ?? 0)} hint={`${counts.featured ?? 0} featured`} />
          <Tile label="Average of what's live" value={stats.liveAverage === null ? "–" : Number(stats.liveAverage).toFixed(2)} hint="Every live review, low ratings included" />
          <Tile label="Sent from the invitation" value={String(stats.bySource.invitation ?? 0)} hint={`${stats.bySource.settings ?? 0} from Settings · ${all} in all`} />
          <div className="rounded-2xl border border-line bg-paper/[0.02] px-4 py-3">
            <p className="text-xs text-paper/60">Sent per week, last 12 weeks</p>
            <Sparkline values={stats.weekly.map((w) => w.count)} width={220} height={48} label="Reviews sent per week" />
          </div>
        </Card>
      )}
      <Card className="p-5">
        <Disclosure summary="Moderation rules">
          <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-paper/65">
            <li>Publish honest reviews, including critical ones. A low rating or a complaint is never a reason to reject or hide.</li>
            <li>
              Reject or hide only for one of the listed reasons:{" "}
              {MODERATION_CODE.ids.map((c) => MODERATION_CODE.label[c].toLowerCase()).join(", ")}. The author sees the reason and any note.
            </li>
            <li>Never edit what someone wrote; nothing here can. If a correction is needed, say so in the note and the author can edit it.</li>
            <li>Badges come from the author&apos;s records and can&apos;t be added or removed here.</li>
            <li>Feature a review for being detailed and useful, never for its rating.</li>
          </ul>
        </Disclosure>
      </Card>
      <Segmented
        label="Review status"
        compact
        options={TABS.map((t) => {
          const n = t === "all" ? all : counts[t];
          return { value: t, label: `${TAB_LABEL[t]}${n ? ` · ${n}` : ""}` };
        })}
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
      {stats && stats.activity.length > 0 && (
        <section aria-labelledby="review-activity-title">
          <h2 id="review-activity-title" className="mb-3 text-base font-semibold tracking-snugg text-paper">
            Latest moderation
          </h2>
          <Card className="divide-y divide-line">
            {stats.activity.map((a) => (
              <p key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-2.5 text-xs sm:px-5">
                <span className="font-semibold text-paper">{actionLabel(a.action)}</span>
                <span className="text-paper/55">{a.actorEmail ?? "An account since deleted"}</span>
                {typeof a.metadata?.code === "string" && (
                  <Badge tone="outline">{MODERATION_CODE.label[a.metadata.code as keyof typeof MODERATION_CODE.label] ?? a.metadata.code}</Badge>
                )}
                <span className="ml-auto text-paper/45">{ago(a.createdAt)}</span>
              </p>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
