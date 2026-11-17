"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Presentation,
} from "lucide-react";
import type { FileRecord } from "@/lib/types";
import { fileKind, fileTypeLabel, formatBytes } from "@/lib/files";
import { fileLink } from "@/lib/file-storage";
import { cn } from "@/lib/utils";

/** A signed link for one of the account's files, fetched once and reused. */
export function useFileLink(path: string | undefined, opts: { download?: string; enabled?: boolean } = {}) {
  const enabled = opts.enabled !== false && Boolean(path);
  const [state, setState] = useState<{ url?: string; error?: string; loading: boolean }>({
    loading: enabled,
  });
  useEffect(() => {
    if (!enabled || !path) return;
    let alive = true;
    setState({ loading: true });
    fileLink(path, opts.download)
      .then((url) => alive && setState({ url, loading: false }))
      .catch((e: Error) => alive && setState({ error: e.message, loading: false }));
    return () => {
      alive = false;
    };
  }, [path, opts.download, enabled]);
  return state;
}

function kindIcon(record: Pick<FileRecord, "type" | "name">) {
  const kind = fileKind(record.type);
  if (kind === "image") return ImageIcon;
  if (kind === "pdf" || kind === "text") return FileText;
  if (/sheet|csv/.test(record.type)) return FileSpreadsheet;
  if (/presentation/.test(record.type)) return Presentation;
  return FileIcon;
}

/** A square preview: the image itself for photos, an icon for everything else. */
export function FileThumb({
  record,
  size = 44,
  className,
}: {
  record: Pick<FileRecord, "type" | "name" | "path">;
  size?: number;
  className?: string;
}) {
  const isImage = fileKind(record.type) === "image";
  const { url, error, loading } = useFileLink(record.path, { enabled: isImage });
  const [broken, setBroken] = useState(false);
  const Icon = kindIcon(record);
  const box = { width: size, height: size };

  if (isImage && !error && !broken) {
    return (
      <span
        className={cn("relative block shrink-0 overflow-hidden rounded-lg border border-line bg-paper/[0.05]", className)}
        style={box}
      >
        {loading || !url ? (
          <span className="absolute inset-0 animate-pulse bg-paper/[0.06]" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link, not a static asset
          <img
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        )}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-lg border border-line",
        error || broken ? "bg-danger/10 text-danger" : "bg-accent/[0.08] text-accent",
        className,
      )}
      style={box}
      title={error}
    >
      {error || broken ? <AlertCircle className="h-4 w-4" /> : <Icon className="h-[18px] w-[18px]" />}
    </span>
  );
}

/** "PDF · 1.2 MB" */
export function fileMeta(record: Pick<FileRecord, "type" | "name" | "size" | "width" | "height">): string {
  const parts = [fileTypeLabel(record), formatBytes(record.size)];
  if (record.width && record.height) parts.push(`${record.width}×${record.height}`);
  return parts.join(" · ");
}

/** One file in a list: thumbnail, name, what it is, and whatever actions the context offers. */
export function FileTile({
  record,
  onOpen,
  actions,
  note,
  className,
}: {
  record: FileRecord;
  onOpen?: () => void;
  actions?: React.ReactNode;
  /** A short extra line, e.g. where the file came from. */
  note?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-xl border border-line bg-paper/[0.02] p-2.5 transition-colors hover:border-paper/20",
        className,
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
        aria-label={`Preview ${record.name}`}
      >
        <FileThumb record={record} />
      </button>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpen}
          className="block max-w-full truncate text-left text-sm font-medium text-paper hover:underline"
          title={record.name}
        >
          {record.name}
        </button>
        <p className="truncate text-[0.68rem] text-paper/50">{fileMeta(record)}</p>
        {note && <p className="truncate text-[0.68rem] text-paper/45">{note}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
    </div>
  );
}

/** Small round icon button used for per-file actions. */
export function FileAction({
  label,
  onClick,
  children,
  tone = "default",
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "default" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-lg text-paper/50 transition-colors disabled:pointer-events-none disabled:opacity-40",
        tone === "danger" ? "hover:bg-danger/10 hover:text-danger" : "hover:bg-paper/[0.07] hover:text-paper",
      )}
    >
      {children}
    </button>
  );
}
