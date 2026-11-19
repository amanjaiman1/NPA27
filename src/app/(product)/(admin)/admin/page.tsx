"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink, LayoutDashboard } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/ui/misc";
import { MetricCard } from "@/components/ui/panel";
import { Progress } from "@/components/ui/progress";
import { BarChart } from "@/components/charts/bar-chart";
import { Sparkline } from "@/components/charts/sparkline";
import { AdminHeader, ErrorPanel, LoadingRows, Stars, When, actionLabel, ago } from "@/components/admin/ui";
import { useAdminActor } from "@/components/admin/admin-context";
import { useAdmin } from "@/lib/platform/client";
import { FEEDBACK_CATEGORY, FEEDBACK_STATUS } from "@/lib/platform/content";
import type { Overview } from "@/lib/platform/types";

const n = (v: number | undefined) => (v ?? 0).toLocaleString("en-IN");
const shortDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function Section({ title, href, linkLabel, children }: { title: string; href?: string; linkLabel?: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-snugg text-paper">{title}</h2>
        {href && (
          <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
            {linkLabel} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-paper/[0.02] px-4 py-3">
      <p className="tabular text-xl font-semibold text-paper">{value}</p>
      <p className="mt-0.5 text-xs text-paper/60">{label}</p>
      {hint && <p className="mt-1 text-[0.7rem] leading-snug text-paper/45">{hint}</p>}
    </div>
  );
}

export default function AdminOverviewPage() {
  const { actor, can } = useAdminActor();
  const { data, error, loading, reload } = useAdmin<Overview>("overview");

  return (
    <div className="space-y-6">
      <AdminHeader
        icon={LayoutDashboard}
        title="Overview"
        description="How the platform is doing, from account records and the platform's own tables. Nothing here reads anyone's chronicle."
      />
      <ErrorPanel error={error} onRetry={reload} />
      {loading && !data ? <LoadingRows rows={3} /> : data ? <OverviewBody data={data} canUsers={can("users.read")} role={actor.role} /> : null}
    </div>
  );
}

function OverviewBody({ data, canUsers, role }: { data: Overview; canUsers: boolean; role: Overview["role"] }) {
  const a = data.accounts;
  const r = data.reviews;
  const f = data.feedback;
  const an = data.announcements;
  const c = data.changelog;
  const ratingTotal = r ? Object.values(r.ratings).reduce((s, v) => s + v, 0) : 0;
  const open = f ? f.total - f.resolved : 0;

  return (
    <div className="space-y-6">
      {a && (
        <div className="space-y-2">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Registered accounts" value={n(a.total)} hint={`${n(a.unconfirmed)} with the email not yet confirmed`} />
            <MetricCard label="New in 7 days" value={n(a.new7)} hint={`${n(a.new30)} in the last 30 days`} />
            <MetricCard label="Recent sign-ins, 7 days" value={n(a.signedIn7)} hint={`${n(a.signedIn30)} in 30 days`} />
            <MetricCard label="Suspended" value={n(a.suspended)} hint="Can't sign in until restored" />
          </div>
          <p className="px-1 text-xs leading-relaxed text-paper/50">
            Sign-ins come from Supabase Auth&apos;s last sign-in time, which changes only when someone signs in afresh. Staying signed
            in doesn&apos;t count, so these show recent sign-in activity, not how much anyone uses DoOrDie.
          </p>
        </div>
      )}

      {data.registrations && (
        <Section title="Registrations, last 30 days" href={canUsers ? "/admin/users?filter=recent" : undefined} linkLabel="New accounts">
          <BarChart
            height={170}
            // A date under every fifth day and the last, with the month only where it changes, so each
            // fits its slot; each bar's own date shows on hover.
            data={(() => {
              let month = -1;
              return data.registrations.map((d, i, all) => {
                const date = new Date(`${d.day}T00:00:00`);
                const shown = i % 5 === 0 || i === all.length - 1;
                const label = !shown ? "" : date.getMonth() !== month ? shortDay.format(date) : String(date.getDate());
                if (shown) month = date.getMonth();
                return { label, sublabel: shortDay.format(date), value: d.count };
              });
            })()}
            formatValue={(v) => `${v} ${v === 1 ? "account" : "accounts"}`}
          />
        </Section>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {r && (
          <Section title="Reviews" href="/admin/reviews" linkLabel="Moderate">
            <div className="grid grid-cols-3 gap-3">
              <Figure label="Waiting" value={n(r.byStatus.pending)} />
              <Figure label="On the website" value={n(r.byStatus.published)} />
              <Figure label="Approved privately" value={n(r.byStatus.approved)} />
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1.5" aria-label="Ratings of every review not withdrawn">
                {(["5", "4", "3", "2", "1"] as const).map((s) => (
                  <div key={s} className="flex items-center gap-3 text-xs">
                    <span className="tabular w-3 text-paper/60">{s}</span>
                    <Progress value={ratingTotal ? (r.ratings[s] / ratingTotal) * 100 : 0} decorative className="flex-1" tone={Number(s) >= 4 ? "positive" : Number(s) === 3 ? "warning" : "danger"} />
                    <span className="tabular w-6 text-right text-paper/55">{r.ratings[s]}</span>
                  </div>
                ))}
                <p className="pt-1 text-[0.7rem] text-paper/45">Ratings of every review sent, published or not.</p>
              </div>
              <div>
                <p className="mb-1 text-[0.7rem] text-paper/50">Sent per week, 12 weeks</p>
                <Sparkline values={r.weekly.map((w) => w.count)} width={140} height={44} label="Reviews sent per week" />
              </div>
            </div>
            {r.pending.length > 0 && (
              <ul className="mt-5 space-y-2 border-t border-line pt-4">
                {r.pending.map((p) => (
                  <li key={p.id} className="flex items-start gap-3 text-sm">
                    <Stars value={p.rating} className="mt-0.5 shrink-0" />
                    <p className="min-w-0 flex-1 truncate text-paper/75">
                      <span className="font-medium text-paper">{p.displayName}:</span> {p.excerpt}
                    </p>
                    <span className="shrink-0 text-xs text-paper/45">{ago(p.submittedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {f && (
          <Section title="Feedback" href="/admin/feedback" linkLabel="Open the Feedback Center">
            <div className="grid grid-cols-3 gap-3">
              <Figure label="New" value={n(f.byStatus.new)} />
              <Figure label="Unresolved" value={n(open)} />
              <Figure label="Resolved or closed" value={f.total ? `${Math.round((f.resolved / f.total) * 100)}%` : "–"} hint={`${n(f.resolved)} of ${n(f.total)}`} />
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_auto]">
              <ul className="space-y-1.5 text-xs">
                {FEEDBACK_CATEGORY.ids.map((id) => (
                  <li key={id} className="flex justify-between gap-3">
                    <span className="text-paper/65">{FEEDBACK_CATEGORY.label[id]}</span>
                    <span className="tabular font-medium text-paper">{n(f.byCategory[id])}</span>
                  </li>
                ))}
              </ul>
              <div>
                <p className="mb-1 text-[0.7rem] text-paper/50">Received per week, 12 weeks</p>
                <Sparkline values={f.weekly.map((w) => w.count)} width={140} height={44} label="Feedback received per week" />
              </div>
            </div>
            {f.recent.length > 0 && (
              <ul className="mt-5 space-y-2 border-t border-line pt-4">
                {f.recent.map((i) => (
                  <li key={i.id} className="flex items-start gap-3 text-sm">
                    <Badge tone="outline" className="shrink-0">
                      {FEEDBACK_CATEGORY.label[i.category]}
                    </Badge>
                    <Link href={`/admin/feedback?id=${i.id}`} className="min-w-0 flex-1 truncate text-paper/75 hover:text-paper">
                      {i.excerpt}
                    </Link>
                    <span className="shrink-0 text-xs text-paper/45">{FEEDBACK_STATUS.label[i.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {an && (
          <Section title="Announcements" href="/admin/announcements" linkLabel="Manage">
            <div className="grid grid-cols-3 gap-3">
              <Figure label="Live now" value={n(an.live)} />
              <Figure label="Scheduled" value={n(an.scheduled)} />
              <Figure label="Drafts" value={n(an.draft)} />
            </div>
            {an.upcoming.length > 0 && (
              <div className="mt-5">
                <p className="eyebrow mb-2">Coming up</p>
                <ul className="space-y-1.5 text-sm">
                  {an.upcoming.map((u) => (
                    <li key={u.id} className="flex justify-between gap-3">
                      <span className="truncate text-paper/80">{u.title}</span>
                      <span className="shrink-0 text-xs text-paper/50">{ago(u.startsAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {an.readership.length > 0 && a && (
              <div className="mt-5">
                <p className="eyebrow mb-2">Opened by</p>
                <ul className="space-y-2 text-xs">
                  {an.readership.map((x) => (
                    <li key={x.id}>
                      <div className="mb-1 flex justify-between gap-3">
                        <span className="truncate text-paper/75">{x.title}</span>
                        <span className="tabular shrink-0 text-paper/55">{n(x.reads)} of {n(a.total)}</span>
                      </div>
                      <Progress value={a.total ? (x.reads / a.total) * 100 : 0} decorative />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        )}

        {c && (
          <Section title="Changelog" href="/admin/changelog" linkLabel="Write an update">
            <div className="grid grid-cols-2 gap-3">
              <Figure label="Published updates" value={n(c.published)} />
              <Figure label="Drafts" value={n(c.drafts)} />
            </div>
            {c.recent.length > 0 && (
              <ul className="mt-5 space-y-1.5 text-sm">
                {c.recent.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3">
                    <Link href={`/changelog/${e.slug}`} className="truncate text-paper/80 hover:text-accent">
                      {e.title}
                    </Link>
                    <span className="shrink-0 text-xs text-paper/50">
                      <When at={e.publishedAt} date />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {data.recentAccounts && (
          <Section title="Newest accounts" href="/admin/users" linkLabel="All users">
            <ul className="divide-y divide-line text-sm">
              {data.recentAccounts.map((u) => (
                <li key={u.id} className="flex justify-between gap-3 py-2">
                  <span className="truncate text-paper/80">{u.email}</span>
                  <span className="shrink-0 text-xs text-paper/50">{ago(u.createdAt)}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {data.recentActions && (
          <Section title="Recent admin actions" href="/admin/audit" linkLabel="Audit log">
            {data.recentActions.length ? (
              <ul className="divide-y divide-line text-sm">
                {data.recentActions.map((x) => (
                  <li key={x.id} className="flex justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-paper/80">
                      <span className="font-medium text-paper">{actionLabel(x.action)}</span>
                      <span className="text-paper/50"> · {x.actorEmail ?? "SQL Editor"}</span>
                    </span>
                    <span className="shrink-0 text-xs text-paper/50">{ago(x.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-paper/55">No administrative actions yet.</p>
            )}
          </Section>
        )}
      </div>

      {role !== "moderator" && (
        <Card className="p-5 sm:p-6">
          <h2 className="text-base font-semibold tracking-snugg text-paper">Supabase usage</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-paper/65">
            Database size, file storage, egress and monthly active users are measured by Supabase and aren&apos;t readable with
            the app&apos;s keys, so they aren&apos;t shown here as numbers. Check them in the Supabase dashboard: Organization,
            then Usage. The Free plan includes 500 MB of database, 1 GB of file storage, 5 GB of egress a month and 50,000
            monthly active users. <code className="text-[0.8rem]">supabase/usage.sql</code> in the repository shows table and
            snapshot sizes from the SQL Editor.
          </p>
          <a
            href="https://supabase.com/dashboard/org/_/usage"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
          >
            Open Supabase usage <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </Card>
      )}

      <Disclosure summary="How these figures are counted">
        <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-paper/60">
          <li>Accounts and registrations come from Supabase Auth&apos;s account records: one per sign-up.</li>
          <li>&ldquo;Signed in&rdquo; is the last time an account entered its password. People stay signed in for weeks, so it undercounts use; there is no tracking of what anyone does in the app.</li>
          <li>Reviews, feedback, announcements and the changelog are counted from their own tables. &ldquo;Opened by&rdquo; counts accounts that opened or dismissed an announcement.</li>
          <li>Generated <When at={data.generatedAt} />.</li>
        </ul>
      </Disclosure>
    </div>
  );
}
