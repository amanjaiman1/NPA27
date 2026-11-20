"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { History, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/misc";
import { AdminHeader, ErrorPanel, LoadingRows, When, actionLabel, actorLine, metadataLine } from "@/components/admin/ui";
import { adminApi, ApiError } from "@/lib/platform/client";
import type { AuditEntry } from "@/lib/platform/types";

const GROUPS = [
  { value: "", label: "Everything" },
  { value: "role.", label: "Roles" },
  { value: "user.", label: "Accounts" },
  { value: "review.", label: "Reviews" },
  { value: "feedback.", label: "Feedback" },
  { value: "crash.", label: "Crash reports" },
  { value: "announcement.", label: "Announcements" },
  { value: "changelog.", label: "Changelog" },
  { value: "setting.", label: "Settings" },
] as const;
type Group = (typeof GROUPS)[number]["value"];
const LIMIT = 50;
const TARGET_WORD: Record<string, string> = {
  user: "Account",
  review: "Review",
  feedback: "Feedback",
  announcement: "Announcement",
  changelog: "Changelog entry",
  setting: "Setting",
};

/** "?targetType=user&targetId=…" narrows the log to one thing, for links from elsewhere. */
function targetFromUrl(): { type: string; id: string } | null {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  const type = p.get("targetType");
  const id = p.get("targetId");
  return type && id ? { type, id } : null;
}

export default function AdminAuditPage() {
  const [group, setGroup] = useState<Group>("");
  // The page mounts only in the browser, once the Admin Center has confirmed a role.
  const [target, setTarget] = useState(targetFromUrl);
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const latest = useRef(0);

  const load = useCallback(
    async (before: number | null) => {
      const id = ++latest.current;
      setLoading(true);
      setError(null);
      const p = new URLSearchParams({ limit: String(LIMIT) });
      if (group) p.set("action", group);
      if (target) {
        p.set("targetType", target.type);
        p.set("targetId", target.id);
      }
      if (before) p.set("before", String(before));
      try {
        const page = await adminApi.get<{ items: AuditEntry[]; limit: number }>(`audit?${p}`);
        if (id !== latest.current) return;
        setItems((prev) => (before ? [...prev, ...page.items] : page.items));
        setMore(page.items.length === page.limit);
      } catch (e) {
        if (id !== latest.current) return;
        setError(e instanceof ApiError ? e : new ApiError(500, "error", "Something went wrong."));
      } finally {
        if (id === latest.current) setLoading(false);
      }
    },
    [group, target],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  return (
    <div className="space-y-6">
      <AdminHeader
        icon={History}
        title="Audit log"
        description="Every administrative action, newest first: who did what, to which record, when and why. It never holds what anyone wrote in DoOrDie."
      />
      <Card className="flex items-start gap-3 p-4 sm:px-5">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <p className="text-xs leading-relaxed text-paper/65">
          Entries can&apos;t be edited or deleted by anyone, a Super Admin included: the database refuses it. Changes made directly in the
          Supabase SQL Editor to roles are recorded too.
        </p>
      </Card>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented label="Show" compact options={GROUPS.map((g) => ({ value: g.value, label: g.label }))} value={group} onChange={setGroup} />
        {target && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-paper/60">
            Only {(TARGET_WORD[target.type] ?? target.type).toLowerCase()} <span className="font-mono">{target.id.slice(0, 8)}</span>
            <Button variant="ghost" size="sm" onClick={() => setTarget(null)}>
              Show everything
            </Button>
          </p>
        )}
      </div>
      <ErrorPanel error={error} onRetry={() => void load(null)} />
      {loading && !items.length ? (
        <LoadingRows />
      ) : !items.length ? (
        !error && (
          <Card className="p-8 text-center">
            <p className="text-sm font-medium text-paper">Nothing here yet.</p>
            <p className="mt-1 text-xs text-paper/55">Actions appear as soon as anyone in the Admin Center takes one.</p>
          </Card>
        )
      ) : (
        <Card className={loading ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={loading}>
          <ol className="divide-y divide-line">
            {items.map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </ol>
        </Card>
      )}
      {more && items.length > 0 && (
        <div className="flex justify-center">
          <Button variant="ghost" disabled={loading} onClick={() => void load(items[items.length - 1].id)}>
            {loading ? "Loading…" : "Load older entries"}
          </Button>
        </div>
      )}
    </div>
  );
}

function EntryRow({ entry: e }: { entry: AuditEntry }) {
  const meta = metadataLine(e.metadata);
  const word = TARGET_WORD[e.targetType] ?? e.targetType;
  const what = e.targetLabel ?? (e.targetId ? `${word} ${e.targetId.slice(0, 8)}` : word);
  return (
    <li className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-paper">
          <span className="font-semibold">{actionLabel(e.action)}</span>
          <span className="text-paper/60"> · </span>
          <span className="break-words">{what}</span>
        </p>
        <p className="mt-0.5 text-xs text-paper/55">{actorLine(e)}</p>
        {e.reason && <p className="mt-1 text-xs text-paper/75">“{e.reason}”</p>}
        {meta && <p className="mt-1 break-words text-xs text-paper/50">{meta}</p>}
      </div>
      <p className="shrink-0 text-xs text-paper/50 sm:text-right">
        <When at={e.createdAt} />
        <span className="block font-mono text-[0.65rem] text-paper/35">#{e.id}</span>
      </p>
    </li>
  );
}
