"use client";

import { useEffect, useState } from "react";
import { CalendarClock, ExternalLink, Pencil, Plus, ScrollText, Send, Trash2, Undo2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Segmented } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { AdminHeader, ErrorPanel, LoadingRows, When, fromLocalInput, toLocalInput } from "@/components/admin/ui";
import { ChangelogEntryView } from "@/components/platform/changelog-entry";
import { adminApi, useAdmin } from "@/lib/platform/client";
import { CHANGELOG_CATEGORY, type ChangelogCategory } from "@/lib/platform/content";
import { FEATURES, FEATURE_KEYS } from "@/lib/features";
import { slugify } from "@/lib/platform/validate";
import type { AdminChangelogEntry } from "@/lib/platform/types";

const STATE_TONE = { draft: "ghost", scheduled: "warning", published: "positive" } as const;
const STATE_LABEL = { draft: "Draft", scheduled: "Scheduled", published: "Published" } as const;

interface Draft {
  title: string;
  slug: string;
  summary: string;
  body: string;
  category: ChangelogCategory;
  featureKey: string;
  imageUrl: string;
  imageAlt: string;
  seoTitle: string;
  seoDescription: string;
  publishedAt: string;
}

const empty: Draft = { title: "", slug: "", summary: "", body: "", category: "improvement", featureKey: "", imageUrl: "", imageAlt: "", seoTitle: "", seoDescription: "", publishedAt: "" };

const toDraft = (e: AdminChangelogEntry | null): Draft =>
  e
    ? {
        title: e.title,
        slug: e.slug,
        summary: e.summary,
        body: e.body,
        category: e.category,
        featureKey: e.featureKey ?? "",
        imageUrl: e.imageUrl ?? "",
        imageAlt: e.imageAlt ?? "",
        seoTitle: e.seoTitle ?? "",
        seoDescription: e.seoDescription ?? "",
        publishedAt: toLocalInput(e.publishedAt),
      }
    : empty;

export default function AdminChangelogPage() {
  const list = useAdmin<{ items: AdminChangelogEntry[] }>("changelog");
  const [editing, setEditing] = useState<AdminChangelogEntry | "new" | null>(null);
  const [publishing, setPublishing] = useState<AdminChangelogEntry | null>(null);

  return (
    <div className="space-y-6">
      <AdminHeader
        icon={ScrollText}
        title="Changelog"
        description="Public updates at /changelog. Write one when an improvement has actually shipped, never before. Drafts stay private."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden /> New update
          </Button>
        }
      />
      <ErrorPanel error={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? (
        <LoadingRows />
      ) : list.data && !list.data.items.length ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-medium text-paper">No updates yet.</p>
          <p className="mt-1 text-xs text-paper/55">The public changelog says so too, until the first one is published.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {list.data?.items.map((e) => (
            <EntryRow key={e.id} entry={e} onEdit={() => setEditing(e)} onPublish={() => setPublishing(e)} onChanged={list.reload} />
          ))}
        </ul>
      )}
      <Editor
        open={editing !== null}
        entry={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={(e, publish) => {
          setEditing(null);
          list.reload();
          if (publish) setPublishing(e);
        }}
      />
      <PublishDialog entry={publishing} onClose={() => setPublishing(null)} onDone={list.reload} />
    </div>
  );
}

function EntryRow({ entry: e, onEdit, onPublish, onChanged }: { entry: AdminChangelogEntry; onEdit: () => void; onPublish: () => void; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  async function run(label: string, call: () => Promise<unknown>) {
    setBusy(true);
    try {
      await call();
      toast({ title: label });
      onChanged();
    } catch (err) {
      toast({ title: "Not changed", description: err instanceof Error ? err.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <ChangelogEntryView entry={e} link={false} />
          </div>
          <div className="flex shrink-0 flex-col gap-2 lg:items-end">
            <Badge tone={STATE_TONE[e.state]}>{STATE_LABEL[e.state]}</Badge>
            <p className="font-mono text-[0.7rem] text-paper/50">/changelog/{e.slug}</p>
            <p className="text-xs text-paper/50">
              Edited <When at={e.updatedAt} />
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <Button size="sm" variant="ghost" onClick={onEdit} disabled={busy}>
            <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
          </Button>
          {e.status === "draft" ? (
            <Button size="sm" onClick={onPublish} disabled={busy}>
              <Send className="h-3.5 w-3.5" aria-hidden /> Publish or schedule
            </Button>
          ) : (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run("Back to draft", () => adminApi.post(`changelog/${e.id}/action`, { action: "unpublish" }))}>
              <Undo2 className="h-3.5 w-3.5" aria-hidden /> Unpublish
            </Button>
          )}
          {e.state === "published" && (
            <a href={`/changelog/${e.slug}`} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold text-accent hover:underline">
              View on the site <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
          {e.status === "draft" && (
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={async () => {
                if (await confirm({ title: "Delete this draft?", description: `“${e.title}” was never published.`, confirmLabel: "Delete draft" })) {
                  void run("Draft deleted", () => adminApi.del(`changelog/${e.id}`));
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
            </Button>
          )}
        </div>
      </Card>
    </li>
  );
}

function Editor({ open, entry, onClose, onSaved }: { open: boolean; entry: AdminChangelogEntry | null; onClose: () => void; onSaved: (e: AdminChangelogEntry, publish: boolean) => void }) {
  const toast = useToast();
  const [d, setD] = useState<Draft>(empty);
  const [slugTouched, setSlugTouched] = useState(false);
  const [view, setView] = useState<"write" | "preview">("write");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  useEffect(() => {
    if (!open) return;
    setD(toDraft(entry));
    setSlugTouched(Boolean(entry));
    setView("write");
    setError(null);
  }, [open, entry]);

  async function save(publish: boolean) {
    setBusy(true);
    setError(null);
    try {
      const fields = {
        ...d,
        slug: d.slug || slugify(d.title),
        featureKey: d.featureKey || null,
        imageUrl: d.imageUrl || null,
        imageAlt: d.imageAlt || null,
        seoTitle: d.seoTitle || null,
        seoDescription: d.seoDescription || null,
        publishedAt: entry?.status === "published" ? fromLocalInput(d.publishedAt) : null,
      };
      const saved = entry
        ? await adminApi.patch<AdminChangelogEntry>(`changelog/${entry.id}`, fields)
        : await adminApi.post<AdminChangelogEntry>("changelog", fields);
      toast({ title: entry ? "Saved" : "Draft saved" });
      onSaved(saved, publish);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Not saved.");
    } finally {
      setBusy(false);
    }
  }

  const preview = { id: "preview", ...d, slug: d.slug || slugify(d.title), featureKey: d.featureKey || null, imageUrl: d.imageUrl || null, imageAlt: d.imageAlt || null, seoTitle: null, seoDescription: null, publishedAt: entry?.publishedAt ?? new Date().toISOString(), requests: entry?.requests ?? 0 };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={entry ? "Edit update" : "New update"}
      description={entry?.status === "published" ? "It's public: saving changes the page." : "A draft. Only administrators see it until it's published."}
      className="sm:max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={entry?.status === "published" ? "primary" : "ghost"} onClick={() => void save(false)} disabled={busy}>
            {entry?.status === "published" ? "Save changes" : "Save draft"}
          </Button>
          {entry?.status !== "published" && (
            <Button onClick={() => void save(true)} disabled={busy}>
              <Send className="h-4 w-4" aria-hidden /> Save and publish…
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          label="Editor view"
          options={[
            { value: "write", label: "Write" },
            { value: "preview", label: "Preview" },
          ]}
          value={view}
          onChange={setView}
        />
        {view === "preview" ? (
          <Card className="p-6">
            <ChangelogEntryView entry={preview} full link={false} />
          </Card>
        ) : (
          <EditorFields d={d} set={set} slugTouched={slugTouched} setSlugTouched={setSlugTouched} published={entry?.status === "published"} />
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function EditorFields({
  d,
  set,
  slugTouched,
  setSlugTouched,
  published,
}: {
  d: Draft;
  set: (patch: Partial<Draft>) => void;
  slugTouched: boolean;
  setSlugTouched: (v: boolean) => void;
  published: boolean;
}) {
  return (
    <div className="space-y-4">
      <Field label="Title">
        <Input
          value={d.title}
          maxLength={120}
          data-autofocus
          placeholder="Mocks keep your place when you save"
          onChange={(e) => set({ title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Category">
          <Select value={d.category} onChange={(e) => set({ category: e.target.value as ChangelogCategory })}>
            {CHANGELOG_CATEGORY.ids.map((c) => (
              <option key={c} value={c}>
                {CHANGELOG_CATEGORY.label[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Feature" optional>
          <Select value={d.featureKey} onChange={(e) => set({ featureKey: e.target.value })}>
            <option value="">None</option>
            {FEATURE_KEYS.map((k) => (
              <option key={k} value={k}>
                {FEATURES[k].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Address" hint={`/changelog/${d.slug || "…"}`}>
          <Input
            value={d.slug}
            maxLength={80}
            onChange={(e) => {
              setSlugTouched(true);
              set({ slug: slugify(e.target.value) });
            }}
          />
        </Field>
      </div>
      <Field label="Summary" hint="One or two sentences, shown in the list and in search results.">
        <Textarea value={d.summary} onChange={(e) => set({ summary: e.target.value })} maxLength={300} className="min-h-[72px]" />
      </Field>
      <Field label="Details" optional hint="**bold**, *italic*, lines starting with - for a list.">
        <Textarea value={d.body} onChange={(e) => set({ body: e.target.value })} maxLength={8000} className="min-h-[160px]" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Image address" optional hint="An https:// address, or a path on this site such as /product/journal.webp.">
          <Input value={d.imageUrl} onChange={(e) => set({ imageUrl: e.target.value.trim() })} maxLength={500} />
        </Field>
        <Field label="Image description" optional hint="Required with an image, for people who can't see it.">
          <Input value={d.imageAlt} onChange={(e) => set({ imageAlt: e.target.value })} maxLength={200} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Search title" optional hint={`${d.seoTitle.length} of 70. Defaults to the title.`}>
          <Input value={d.seoTitle} onChange={(e) => set({ seoTitle: e.target.value })} maxLength={70} />
        </Field>
        <Field label="Search description" optional hint={`${d.seoDescription.length} of 170. Defaults to the summary.`}>
          <Input value={d.seoDescription} onChange={(e) => set({ seoDescription: e.target.value })} maxLength={170} />
        </Field>
      </div>
      {published && (
        <Field label="Publication date" hint="The date the update shows. Move it only to correct it.">
          <Input type="datetime-local" value={d.publishedAt} onChange={(e) => set({ publishedAt: e.target.value })} />
        </Field>
      )}
    </div>
  );
}

function PublishDialog({ entry, onClose, onDone }: { entry: AdminChangelogEntry | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entry) return;
    setWhen("now");
    setAt(toLocalInput(new Date(Date.now() + 86_400_000).toISOString()));
    setError(null);
  }, [entry]);

  async function publish() {
    if (!entry) return;
    setBusy(true);
    setError(null);
    try {
      const out = await adminApi.post<AdminChangelogEntry>(`changelog/${entry.id}/action`, { action: "publish", publishedAt: when === "later" ? fromLocalInput(at) : null });
      toast({ title: out.state === "scheduled" ? "Scheduled" : "Published", description: `/changelog/${out.slug}` });
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Not published.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={Boolean(entry)}
      onClose={() => !busy && onClose()}
      title="Publish update"
      description={entry ? `${entry.title}. Publish it only once the change is live.` : undefined}
      className="sm:max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void publish()} disabled={busy}>
            {when === "later" ? <CalendarClock className="h-4 w-4" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            {busy ? "Publishing…" : when === "later" ? "Schedule" : "Publish now"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          label="When"
          options={[
            { value: "now", label: "Now" },
            { value: "later", label: "On a set date" },
          ]}
          value={when}
          onChange={setWhen}
        />
        {when === "later" && (
          <Field label="Publish on" hint="It appears on /changelog from then.">
            <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
          </Field>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
