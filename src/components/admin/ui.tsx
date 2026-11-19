"use client";

import { useEffect, useId, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Search, Star, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/form";
import { AUDIT_ACTION_LABEL } from "@/lib/platform/content";
import { ROLE_LABEL } from "@/lib/platform/roles";
import type { HistoryEntry } from "@/lib/platform/types";
import { cn } from "@/lib/utils";

export function AdminHeader(props: {
  icon: React.ElementType;
  title: string;
  description: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return <PageHeader eyebrow="Admin Center" icon={props.icon} title={props.title} description={props.description} actions={props.actions} />;
}

const dateTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dateOnly = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** "19 Nov 2026, 14:05", or just the date. */
export function When({ at, date = false, fallback = "Never" }: { at: string | null | undefined; date?: boolean; fallback?: string }) {
  if (!at) return <span className="text-paper/45">{fallback}</span>;
  const d = new Date(at);
  return (
    <time dateTime={d.toISOString()} title={dateTime.format(d)}>
      {(date ? dateOnly : dateTime).format(d)}
    </time>
  );
}

/** "2026-11-19T14:30" for a datetime-local input, in the browser's time zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A datetime-local value (the browser's time zone) as an ISO instant; empty is null. */
export const fromLocalInput = (v: string): string | null => (v ? new Date(v).toISOString() : null);

/** "3 days ago", "in 2 hours". */
export function ago(at: string): string {
  const diff = new Date(at).getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  const mins = Math.round(diff / 60_000);
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 36) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden className={cn("h-3.5 w-3.5", n <= value ? "fill-warning text-warning" : "text-paper/25")} />
      ))}
    </span>
  );
}

export function ErrorPanel({ error, onRetry }: { error: { message: string } | null; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <Card className="flex flex-col items-start gap-3 border-danger/30 p-5 sm:flex-row sm:items-center">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger">
        <TriangleAlert className="h-4 w-4" aria-hidden />
      </span>
      <p role="alert" className="flex-1 text-sm text-paper/75">
        {error.message}
      </p>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Try again
        </Button>
      )}
    </Card>
  );
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-2xl" />
      ))}
    </div>
  );
}

export function Pager({ total, limit, offset, onChange }: { total: number; limit: number; offset: number; onChange: (offset: number) => void }) {
  if (total <= limit) return total ? <p className="text-xs text-paper/50">{total.toLocaleString("en-IN")} in all</p> : null;
  const end = Math.min(total, offset + limit);
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="tabular text-xs text-paper/55">
        {offset + 1}–{end} of {total.toLocaleString("en-IN")}
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Previous
        </Button>
        <Button variant="ghost" size="sm" disabled={end >= total} onClick={() => onChange(offset + limit)}>
          Next <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/** A search box that tells its parent once typing pauses. */
export function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => onChange(draft.trim()), 350);
    return () => clearTimeout(t);
  }, [draft, value, onChange]);
  return (
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/40" aria-hidden />
      <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} className="pl-10" type="search" />
    </label>
  );
}

const show = (v: unknown) => (v === null || v === undefined ? "–" : typeof v === "object" ? JSON.stringify(v) : String(v).replace(/_/g, " "));

/** An audit entry's metadata as one short line: "pending → published · rating: 4". */
export function metadataLine(metadata: Record<string, unknown> | null | undefined): string | null {
  const m = metadata ?? {};
  const parts: string[] = [];
  if ("from" in m || "to" in m) parts.push(`${show(m.from)} → ${show(m.to)}`);
  for (const [k, v] of Object.entries(m)) {
    if (k === "from" || k === "to") continue;
    // A role that went with a deleted account wasn't removed in the SQL Editor, whatever the trigger saw.
    if (k === "via") parts.push(m.accountDeleted ? "" : "in the SQL Editor");
    else if (k === "accountDeleted") parts.push("the account was deleted");
    else if (v && typeof v === "object" && "to" in v) parts.push(`${k}: ${show((v as { from?: unknown }).from)} → ${show((v as { to: unknown }).to)}`);
    else if (v !== null && v !== undefined) parts.push(`${k}: ${show(v)}`);
  }
  const shown = parts.filter(Boolean);
  return shown.length ? shown.join(" · ") : null;
}

export const actionLabel = (action: string) => AUDIT_ACTION_LABEL[action] ?? action;

/** Who did it: "a@b.c (Admin)", the SQL Editor, or the account's own deletion. */
export function actorLine(e: Pick<HistoryEntry, "actorEmail" | "actorRole" | "metadata">): string {
  if (e.actorEmail) return `${e.actorEmail}${e.actorRole ? ` (${ROLE_LABEL[e.actorRole]})` : ""}`;
  if (e.metadata?.accountDeleted) return "Removed with the account";
  if (e.metadata?.via === "sql") return "Supabase SQL Editor";
  return "An account since deleted";
}

/** The administrative history of one thing, newest first. */
export function HistoryList({ entries, empty = "Nothing has been done to this yet." }: { entries: HistoryEntry[] | undefined; empty?: string }) {
  if (!entries?.length) return <p className="text-xs text-paper/50">{empty}</p>;
  return (
    <ol className="space-y-2.5">
      {entries.map((e) => {
        const meta = metadataLine(e.metadata);
        return (
          <li key={e.id} className="rounded-xl border border-line bg-paper/[0.02] px-3.5 py-2.5 text-xs">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-semibold text-paper">{actionLabel(e.action)}</span>
              <span className="text-paper/50">
                <When at={e.createdAt} />
              </span>
            </p>
            <p className="mt-0.5 text-paper/60">{actorLine(e)}</p>
            {e.reason && <p className="mt-1 text-paper/75">“{e.reason}”</p>}
            {meta && <p className="mt-1 text-paper/50">{meta}</p>}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Asks for a reason before an action that needs one (suspending, rejecting,
 * hiding). Shows the server's answer if it refuses.
 */
export function ReasonDialog({
  open,
  onClose,
  title,
  description,
  label,
  confirmLabel,
  tone = "danger",
  required = true,
  placeholder,
  children,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  label: string;
  confirmLabel: string;
  tone?: "danger" | "default";
  required?: boolean;
  placeholder?: string;
  children?: React.ReactNode;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  async function confirm() {
    if (required && reason.trim().length < 5) return setError("Give a reason of at least 5 characters.");
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={title}
      description={description}
      className="sm:max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={() => void confirm()} disabled={busy}>
            {busy ? "Saving…" : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {children}
        <Field label={label} optional={!required} error={error} hint={required ? "At least 5 characters. It's kept in the audit log." : undefined}>
          <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder={placeholder} data-autofocus />
        </Field>
      </div>
    </Modal>
  );
}
