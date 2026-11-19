"use client";

import { useEffect, useState } from "react";
import { Archive, CalendarClock, Megaphone, Pencil, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Segmented } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { AdminHeader, ErrorPanel, LoadingRows, When, fromLocalInput, toLocalInput } from "@/components/admin/ui";
import { AnnouncementBody } from "@/components/platform/announcement-card";
import { adminApi, useAdmin } from "@/lib/platform/client";
import { ANNOUNCEMENT_CATEGORY, ANNOUNCEMENT_STATE, type AnnouncementCategory, type AnnouncementState } from "@/lib/platform/content";
import type { AdminAnnouncement, AnnouncementList } from "@/lib/platform/types";

const STATE_TONE: Record<AnnouncementState, "ghost" | "warning" | "positive" | "outline" | "default"> = {
  draft: "ghost",
  scheduled: "warning",
  live: "positive",
  ended: "outline",
  archived: "default",
};

export default function AdminAnnouncementsPage() {
  const list = useAdmin<AnnouncementList>("announcements");
  const [editing, setEditing] = useState<AdminAnnouncement | "new" | null>(null);
  const [publishing, setPublishing] = useState<AdminAnnouncement | null>(null);

  return (
    <div className="space-y-6">
      <AdminHeader
        icon={Megaphone}
        title="Announcements"
        description="Messages shown inside the app: a banner the first time, then in the notifications panel and on the Announcements page. Schedule them, end them, archive them."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden /> New announcement
          </Button>
        }
      />
      <ErrorPanel error={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? (
        <LoadingRows />
      ) : list.data && !list.data.items.length ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-medium text-paper">No announcements yet.</p>
          <p className="mt-1 text-xs text-paper/55">Write one for a new feature, planned maintenance or anything students should know.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {list.data?.items.map((a) => (
            <AnnouncementRow
              key={a.id}
              item={a}
              accounts={list.data?.accounts ?? 0}
              onEdit={() => setEditing(a)}
              onPublish={() => setPublishing(a)}
              onChanged={list.reload}
            />
          ))}
        </ul>
      )}
      {list.data && (
        <Editor
          open={editing !== null}
          item={editing === "new" ? null : editing}
          defaults={list.data.defaults}
          onClose={() => setEditing(null)}
          onSaved={(a, publish) => {
            setEditing(null);
            list.reload();
            if (publish) setPublishing(a);
          }}
        />
      )}
      {list.data && (
        <PublishDialog item={publishing} days={list.data.defaults.days} onClose={() => setPublishing(null)} onDone={list.reload} />
      )}
    </div>
  );
}

function AnnouncementRow({
  item: a,
  accounts,
  onEdit,
  onPublish,
  onChanged,
}: {
  item: AdminAnnouncement;
  accounts: number;
  onEdit: () => void;
  onPublish: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  async function act(action: "unpublish" | "archive" | "restore") {
    setBusy(true);
    try {
      await adminApi.post(`announcements/${a.id}/action`, { action });
      toast({ title: action === "unpublish" ? "Back to draft" : action === "archive" ? "Archived" : "Restored as a draft" });
      onChanged();
    } catch (e) {
      toast({ title: "Not changed", description: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({ title: "Delete this draft?", description: `“${a.title}” was never published, so nobody has seen it.`, confirmLabel: "Delete draft" });
    if (!ok) return;
    setBusy(true);
    try {
      await adminApi.del(`announcements/${a.id}`);
      toast({ title: "Draft deleted" });
      onChanged();
    } catch (e) {
      toast({ title: "Not deleted", description: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const neverPublished = a.status === "draft" && !a.publishedAt;
  return (
    <li>
      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <AnnouncementBody title={a.title} body={a.body} category={a.category} className="min-w-0 flex-1" />
          <div className="flex shrink-0 flex-col gap-2 lg:w-60 lg:items-end">
            <Badge tone={STATE_TONE[a.state]}>{ANNOUNCEMENT_STATE.label[a.state]}</Badge>
            <p className="text-xs text-paper/55 lg:text-right">
              {a.startsAt ? (
                <>
                  {a.state === "scheduled" ? "Starts" : "Started"} <When at={a.startsAt} />
                </>
              ) : (
                <>
                  Edited <When at={a.updatedAt} />
                </>
              )}
              {a.endsAt && (
                <>
                  <br />
                  {a.state === "ended" ? "Ended" : "Ends"} <When at={a.endsAt} />
                </>
              )}
            </p>
            {a.startsAt && (
              <p className="tabular text-xs text-paper/55">
                Opened by {a.reads.toLocaleString("en-IN")} of {accounts.toLocaleString("en-IN")} · dismissed by {a.dismissals.toLocaleString("en-IN")}
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          {a.status !== "archived" && (
            <Button size="sm" variant="ghost" onClick={onEdit} disabled={busy}>
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
            </Button>
          )}
          {a.status === "draft" && (
            <Button size="sm" onClick={onPublish} disabled={busy}>
              <Send className="h-3.5 w-3.5" aria-hidden /> Publish or schedule
            </Button>
          )}
          {a.status === "published" && (
            <Button size="sm" variant="ghost" onClick={() => void act("unpublish")} disabled={busy} hint="Take it out of the app and back to a draft.">
              <Undo2 className="h-3.5 w-3.5" aria-hidden /> Unpublish
            </Button>
          )}
          {a.status !== "archived" && (
            <Button size="sm" variant="subtle" onClick={() => void act("archive")} disabled={busy} hint="Hide it everywhere, keeping its record.">
              <Archive className="h-3.5 w-3.5" aria-hidden /> Archive
            </Button>
          )}
          {a.status === "archived" && (
            <Button size="sm" variant="ghost" onClick={() => void act("restore")} disabled={busy}>
              <Undo2 className="h-3.5 w-3.5" aria-hidden /> Restore as draft
            </Button>
          )}
          {neverPublished && (
            <Button size="sm" variant="danger" onClick={() => void remove()} disabled={busy}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
            </Button>
          )}
        </div>
      </Card>
    </li>
  );
}

function Editor({
  open,
  item,
  defaults,
  onClose,
  onSaved,
}: {
  open: boolean;
  item: AdminAnnouncement | null;
  defaults: AnnouncementList["defaults"];
  onClose: () => void;
  onSaved: (a: AdminAnnouncement, publish: boolean) => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<AnnouncementCategory>("general");
  const [endsAt, setEndsAt] = useState("");
  const [view, setView] = useState<"write" | "preview">("write");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? "");
    setBody(item?.body ?? "");
    setCategory(item?.category ?? defaults.category);
    setEndsAt(toLocalInput(item?.endsAt));
    setView("write");
    setError(null);
  }, [open, item, defaults.category]);

  async function save(publish: boolean) {
    setBusy(true);
    setError(null);
    try {
      const fields = { title, body, category, endsAt: fromLocalInput(endsAt) };
      const saved = item
        ? await adminApi.patch<AdminAnnouncement>(`announcements/${item.id}`, fields)
        : await adminApi.post<AdminAnnouncement>("announcements", fields);
      toast({ title: item ? "Saved" : "Draft saved" });
      onSaved(saved, publish);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Not saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={item ? "Edit announcement" : "New announcement"}
      description={item?.status === "published" ? "It's published: changes show in the app straight away." : "Saved as a draft. Nobody sees it until you publish it."}
      className="sm:max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={item?.status === "published" ? "primary" : "ghost"} onClick={() => void save(false)} disabled={busy}>
            {item?.status === "published" ? "Save changes" : "Save draft"}
          </Button>
          {item?.status !== "published" && (
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
          <Card className="p-5">
            <AnnouncementBody title={title || "Untitled"} body={body || "Nothing written yet."} category={category} date="Today" />
          </Card>
        ) : (
          <>
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Habits now count Roadmap work" data-autofocus />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category">
                <Select value={category} onChange={(e) => setCategory(e.target.value as AnnouncementCategory)}>
                  {ANNOUNCEMENT_CATEGORY.ids.map((c) => (
                    <option key={c} value={c}>
                      {ANNOUNCEMENT_CATEGORY.label[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Ends" optional hint="After this it leaves the banner and the panel, and stays on the Announcements page.">
                <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </Field>
            </div>
            <Field label="Message" hint="Plain text. **bold**, *italic*, lines starting with - for a list.">
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} className="min-h-[160px]" />
            </Field>
          </>
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

/** Publish now or at a time, with an end date offered from the platform default. */
function PublishDialog({ item, days, onClose, onDone }: { item: AdminAnnouncement | null; days: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [when, setWhen] = useState<"now" | "later">("now");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setWhen("now");
    const start = new Date(Date.now() + 60 * 60_000);
    start.setMinutes(0, 0, 0);
    setStartsAt(toLocalInput(start.toISOString()));
    setEndsAt(item.endsAt ? toLocalInput(item.endsAt) : toLocalInput(new Date(Date.now() + days * 86_400_000).toISOString()));
    setError(null);
  }, [item, days]);

  async function publish() {
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      const out = await adminApi.post<AdminAnnouncement>(`announcements/${item.id}/action`, {
        action: "publish",
        startsAt: when === "later" ? fromLocalInput(startsAt) : null,
        endsAt: fromLocalInput(endsAt),
      });
      toast({ title: out.state === "scheduled" ? "Scheduled" : "Published", description: out.title });
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
      open={Boolean(item)}
      onClose={() => !busy && onClose()}
      title="Publish announcement"
      description={item?.title}
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
            { value: "later", label: "At a set time" },
          ]}
          value={when}
          onChange={setWhen}
        />
        {when === "later" && (
          <Field label="Starts" hint="In your time zone. Students see it from then.">
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
        )}
        <Field label="Ends" optional hint={`Offered ${days} days ahead (Platform settings). Clear it to keep it up until you archive it.`}>
          <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
