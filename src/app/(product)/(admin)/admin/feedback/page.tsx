"use client";

import { useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, Lock, Mail, MessageSquareText, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/misc";
import { Field, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { AdminHeader, ErrorPanel, HistoryList, LoadingRows, Pager, SearchBox, When, ago } from "@/components/admin/ui";
import { useAdminActor } from "@/components/admin/admin-context";
import { adminApi, useAdmin } from "@/lib/platform/client";
import { FEEDBACK_CATEGORY, FEEDBACK_PRIORITY, FEEDBACK_STATUS, type FeedbackStatus } from "@/lib/platform/content";
import type { AdminChangelogEntry, AdminFeedback, FeedbackDetail, FeedbackList } from "@/lib/platform/types";

const STATUS_FILTERS = ["open", "new", "under_review", "planned", "in_progress", "resolved", "closed", "all"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
const filterLabel = (s: StatusFilter) => (s === "open" ? "Open" : s === "all" ? "All" : FEEDBACK_STATUS.label[s]);
const STATUS_TONE: Record<FeedbackStatus, "warning" | "accent" | "default" | "positive" | "ghost"> = {
  new: "warning",
  under_review: "accent",
  planned: "accent",
  in_progress: "default",
  resolved: "positive",
  closed: "ghost",
};
const PRIORITY_TONE = { low: "ghost", normal: "outline", high: "warning", urgent: "danger" } as const;
const LIMIT = 25;

export default function AdminFeedbackPage() {
  const [status, setStatus] = useState<StatusFilter>("open");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) setOpen(id);
  }, []);

  const path = useMemo(() => {
    const p = new URLSearchParams({ status, limit: String(LIMIT), offset: String(offset) });
    if (category) p.set("category", category);
    if (priority) p.set("priority", priority);
    if (q) p.set("q", q);
    return `feedback?${p}`;
  }, [status, category, priority, q, offset]);
  const list = useAdmin<FeedbackList>(path);
  const reset = () => setOffset(0);

  return (
    <div className="space-y-6">
      <AdminHeader
        icon={MessageSquareText}
        title="Feedback"
        description="Bug reports, feature requests, suggestions and anything else students send from Settings. Notes stay private; a response is what the author reads."
      />
      <Segmented
        label="Status"
        compact
        options={STATUS_FILTERS.map((s) => ({
          value: s,
          label: `${filterLabel(s)}${s !== "open" && s !== "all" && list.data?.counts[s] ? ` · ${list.data.counts[s]}` : ""}`,
        }))}
        value={status}
        onChange={(v) => {
          setStatus(v);
          reset();
        }}
      />
      <div className="flex flex-col gap-3 md:flex-row">
        <SearchBox value={q} onChange={(v) => {
            setQ(v);
            reset();
          }} placeholder="Search the messages" label="Search feedback" />
        <Select value={category} onChange={(e) => {
            setCategory(e.target.value);
            reset();
          }} aria-label="Category" className="md:w-52">
          <option value="">Every category</option>
          {FEEDBACK_CATEGORY.ids.map((id) => (
            <option key={id} value={id}>
              {FEEDBACK_CATEGORY.label[id]}
            </option>
          ))}
        </Select>
        <Select value={priority} onChange={(e) => {
            setPriority(e.target.value);
            reset();
          }} aria-label="Priority" className="md:w-44">
          <option value="">Any priority</option>
          {FEEDBACK_PRIORITY.ids.map((id) => (
            <option key={id} value={id}>
              {FEEDBACK_PRIORITY.label[id]}
            </option>
          ))}
        </Select>
      </div>
      <ErrorPanel error={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? (
        <LoadingRows />
      ) : list.data && !list.data.items.length ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-medium text-paper">Nothing here.</p>
          <p className="mt-1 text-xs text-paper/55">Feedback appears as students send it.</p>
        </Card>
      ) : (
        <ul className="space-y-3">{list.data?.items.map((f) => <FeedbackRow key={f.id} item={f} onOpen={() => setOpen(f.id)} />)}</ul>
      )}
      {list.data && <Pager total={list.data.total} limit={list.data.limit} offset={list.data.offset} onChange={setOffset} />}
      <FeedbackDialog id={open} onClose={() => setOpen(null)} onChanged={list.reload} />
    </div>
  );
}

function FeedbackRow({ item: f, onOpen }: { item: AdminFeedback; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded-2xl border border-line bg-card p-4 text-left shadow-soft transition-all hover:-translate-y-px hover:border-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 sm:p-5"
      >
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[f.status]}>{FEEDBACK_STATUS.label[f.status]}</Badge>
          <Badge tone="outline">{FEEDBACK_CATEGORY.label[f.category]}</Badge>
          {f.priority !== "normal" && <Badge tone={PRIORITY_TONE[f.priority]}>{FEEDBACK_PRIORITY.label[f.priority]} priority</Badge>}
          {f.hasScreenshot && (
            <span className="inline-flex items-center gap-1 text-[0.7rem] text-paper/55">
              <ImageIcon className="h-3 w-3" aria-hidden /> Screenshot
            </span>
          )}
          {f.noteCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[0.7rem] text-paper/55">
              <Lock className="h-3 w-3" aria-hidden /> {f.noteCount} {f.noteCount === 1 ? "note" : "notes"}
            </span>
          )}
          <span className="ml-auto text-xs text-paper/45">{ago(f.createdAt)}</span>
        </span>
        <span className="mt-2.5 line-clamp-2 block text-sm leading-relaxed text-paper/85">{f.message}</span>
        {(f.response || f.changelog) && (
          <span className="mt-2 block text-xs text-paper/50">
            {f.response ? "Answered" : ""}
            {f.response && f.changelog ? " · " : ""}
            {f.changelog ? `Linked to “${f.changelog.title}”` : ""}
          </span>
        )}
      </button>
    </li>
  );
}

function FeedbackDialog({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { can } = useAdminActor();
  const toast = useToast();
  const detail = useAdmin<FeedbackDetail>(id ? `feedback/${id}` : null);
  const changelog = useAdmin<{ items: AdminChangelogEntry[] }>(id && can("changelog.manage") ? "changelog" : null);
  const [note, setNote] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const f = id && detail.data?.id === id ? detail.data : null;

  useEffect(() => {
    setReply(f?.response ?? "");
    setNote("");
  }, [f?.id, f?.response]);

  async function run(label: string, call: () => Promise<FeedbackDetail | AdminFeedback>) {
    setBusy(true);
    try {
      const next = await call();
      if (next && "notes" in next) detail.set(next);
      else detail.reload();
      toast({ title: label });
      onChanged();
      return true;
    } catch (e) {
      toast({ title: "Not saved", description: e instanceof Error ? e.message : undefined, tone: "error" });
      return false;
    } finally {
      setBusy(false);
    }
  }
  const patch = (body: Record<string, unknown>, label: string) => run(label, () => adminApi.patch(`feedback/${id}`, body));

  return (
    <Modal
      open={Boolean(id)}
      onClose={onClose}
      title={f ? FEEDBACK_CATEGORY.label[f.category] : "Feedback"}
      description={f ? `Sent ${ago(f.createdAt)}` : undefined}
      className="sm:max-w-2xl"
    >
      {detail.error && <ErrorPanel error={detail.error} onRetry={detail.reload} />}
      {!f && !detail.error && <LoadingRows rows={2} />}
      {f && (
        <div className="space-y-6">
          <p className="whitespace-pre-line rounded-2xl border border-line bg-paper/[0.02] p-4 text-sm leading-relaxed text-paper/90">{f.message}</p>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Status">
              <Select value={f.status} disabled={busy} onChange={(e) => void patch({ status: e.target.value }, "Status changed")}>
                {FEEDBACK_STATUS.ids.map((s) => (
                  <option key={s} value={s}>
                    {FEEDBACK_STATUS.label[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={f.priority} disabled={busy} onChange={(e) => void patch({ priority: e.target.value }, "Priority changed")}>
                {FEEDBACK_PRIORITY.ids.map((p) => (
                  <option key={p} value={p}>
                    {FEEDBACK_PRIORITY.label[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category">
              <Select value={f.category} disabled={busy} onChange={(e) => void patch({ category: e.target.value }, "Category changed")}>
                {FEEDBACK_CATEGORY.ids.map((c) => (
                  <option key={c} value={c}>
                    {FEEDBACK_CATEGORY.label[c]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 text-xs sm:grid-cols-2">
            <div className="rounded-2xl border border-line p-3.5">
              <p className="mb-1 font-semibold text-paper">From</p>
              {f.email ? (
                <a href={`mailto:${f.email}`} className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline">
                  <Mail className="h-3.5 w-3.5" aria-hidden /> {f.email}
                </a>
              ) : (
                <p className="text-paper/60">Email not shared. Reply here: they read it in Settings.</p>
              )}
              <p className="mt-1 break-all font-mono text-[0.68rem] text-paper/45">{f.userId}</p>
            </div>
            <div className="rounded-2xl border border-line p-3.5">
              <p className="mb-1 font-semibold text-paper">Technical details</p>
              {Object.keys(f.context).length ? (
                <ul className="space-y-0.5 text-paper/65">
                  {f.context.screen && <li>Window: {f.context.screen}</li>}
                  {f.context.installed !== undefined && <li>{f.context.installed ? "Installed app" : "Browser tab"}</li>}
                  {f.context.userAgent && <li className="break-words">{f.context.userAgent}</li>}
                </ul>
              ) : (
                <p className="text-paper/60">Not included.</p>
              )}
            </div>
          </div>

          {f.screenshotUrl && (
            <figure>
              {/* A short-lived signed link to the private bucket, so next/image can't optimise it. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.screenshotUrl} alt="Screenshot sent with this feedback" className="max-h-80 rounded-2xl border border-line object-contain" />
              <figcaption className="mt-1 text-[0.7rem] text-paper/50">The link works for five minutes. Reopen to see it again.</figcaption>
            </figure>
          )}

          <Field label="Changelog entry" hint="Link the update that answers this. The changelog then counts it as a request, without showing it.">
            {can("changelog.manage") ? (
              <Select
                value={f.changelog?.id ?? ""}
                disabled={busy}
                onChange={(e) => void patch({ changelogEntryId: e.target.value || null }, e.target.value ? "Linked" : "Unlinked")}
              >
                <option value="">Not linked</option>
                {(changelog.data?.items ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                    {c.state !== "published" ? ` (${c.state})` : ""}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="text-sm text-paper/70">{f.changelog ? f.changelog.title : "Not linked"}</p>
            )}
          </Field>

          <section aria-labelledby="reply-title" className="rounded-2xl border border-accent/25 bg-accent/[0.04] p-4">
            <h3 id="reply-title" className="text-sm font-semibold text-paper">
              Response to the author
            </h3>
            <p className="mt-0.5 text-xs text-paper/55">They read it in Settings, then Help &amp; feedback.</p>
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              maxLength={2000}
              className="mt-3"
              aria-label="Response to the author"
              placeholder="Thanks for this. It's fixed in today's update."
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={busy || !reply.trim() || reply.trim() === (f.response ?? "")}
                onClick={() => void run("Response sent", () => adminApi.put(`feedback/${f.id}/response`, { response: reply.trim() }))}
              >
                <Send className="h-3.5 w-3.5" aria-hidden /> {f.response ? "Update response" : "Send response"}
              </Button>
              {f.response && (
                <Button size="sm" variant="subtle" disabled={busy} onClick={() => void run("Response removed", () => adminApi.put(`feedback/${f.id}/response`, { response: null }))}>
                  Remove
                </Button>
              )}
              {f.responseAt && (
                <span className="text-xs text-paper/50">
                  Sent <When at={f.responseAt} />
                </span>
              )}
            </div>
          </section>

          <section aria-labelledby="notes-title">
            <h3 id="notes-title" className="flex items-center gap-1.5 text-sm font-semibold text-paper">
              <Lock className="h-3.5 w-3.5 text-paper/50" aria-hidden /> Private notes
            </h3>
            <p className="mt-0.5 text-xs text-paper/55">For the team only. The author never sees these.</p>
            {f.notes.length > 0 && (
              <ul className="mt-3 space-y-2">
                {f.notes.map((n) => (
                  <li key={n.id} className="rounded-xl border border-line bg-paper/[0.02] px-3.5 py-2.5 text-sm">
                    <p className="whitespace-pre-line text-paper/85">{n.body}</p>
                    <p className="mt-1 text-[0.7rem] text-paper/50">
                      {n.authorEmail ?? "An administrator"} · <When at={n.createdAt} />
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Reproduced on Android Chrome." aria-label="New private note" className="min-h-[64px]" />
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0"
                disabled={busy || !note.trim()}
                onClick={async () => {
                  if (await run("Note added", () => adminApi.post(`feedback/${f.id}/notes`, { body: note.trim() }))) setNote("");
                }}
              >
                Add note
              </Button>
            </div>
          </section>

          <section aria-label="History">
            <p className="eyebrow mb-2">History</p>
            <HistoryList entries={f.history} />
          </section>
        </div>
      )}
    </Modal>
  );
}
