"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, FileText, Loader2, NotebookPen, Target, HeartPulse } from "lucide-react";
import type { FileRecord } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import { buildFileRefs, fileKind } from "@/lib/files";
import { fileText } from "@/lib/file-storage";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { FileThumb, fileMeta, useFileLink } from "./file-tile";

function TextPreview({ path }: { path: string }) {
  const [state, setState] = useState<{ text?: string; truncated?: boolean; error?: string }>({});
  useEffect(() => {
    let alive = true;
    fileText(path)
      .then((r) => alive && setState(r))
      .catch((e: Error) => alive && setState({ error: e.message }));
    return () => {
      alive = false;
    };
  }, [path]);
  if (state.error) return <p className="text-sm text-danger">{state.error}</p>;
  if (state.text == null)
    return (
      <div className="flex items-center gap-2 text-sm text-paper/55">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  return (
    <div>
      <pre className="max-h-[55dvh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-paper/[0.03] p-4 text-[0.8rem] leading-relaxed text-paper/85">
        {state.text || "This file is empty."}
      </pre>
      {state.truncated && (
        <p className="mt-2 text-[0.7rem] text-paper/50">Only the beginning is shown. Download it to read the rest.</p>
      )}
    </div>
  );
}

/**
 * A file, opened. Images and text show here; PDFs show here on larger screens
 * and open in the browser's viewer everywhere; other documents download.
 * Below the file: every day and goal that uses it, each a link.
 */
export function FilePreview({
  record,
  open,
  onClose,
}: {
  record: FileRecord | null;
  open: boolean;
  onClose: () => void;
}) {
  const journal = useChronicle((s) => s.journal);
  const goals = useChronicle((s) => s.goals);
  const lifeLog = useChronicle((s) => s.lifeLog);
  const refs = useMemo(
    () => (record ? buildFileRefs({ journal, goals, lifeLog }).get(record.id) : undefined),
    [record, journal, goals, lifeLog],
  );
  const kind = record ? fileKind(record.type) : "document";
  const view = useFileLink(record?.path, { enabled: open && Boolean(record) });
  const dl = useFileLink(record?.path, { download: record?.name, enabled: open && Boolean(record) });

  return (
    <Modal
      open={open && Boolean(record)}
      onClose={onClose}
      title={record?.name}
      description={record ? fileMeta(record) : undefined}
      className="sm:max-w-3xl"
      footer={
        record && (
          <>
            <Button variant="ghost" onClick={onClose} className="mr-auto">
              Close
            </Button>
            <a
              href={view.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!view.url}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-semibold text-paper shadow-soft transition-colors hover:border-paper/25 aria-disabled:pointer-events-none aria-disabled:opacity-40"
            >
              <ExternalLink className="h-4 w-4" /> Open
            </a>
            <a
              href={dl.url}
              aria-disabled={!dl.url}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-fg shadow-accent transition-all hover:brightness-[1.08] aria-disabled:pointer-events-none aria-disabled:opacity-40"
            >
              <Download className="h-4 w-4" /> Download
            </a>
          </>
        )
      }
    >
      {record && (
        <div className="space-y-5">
          {view.error ? (
            <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-paper/80">{view.error}</p>
          ) : kind === "image" ? (
            <div className="grid min-h-[12rem] place-items-center overflow-hidden rounded-xl border border-line bg-paper/[0.03]">
              {view.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed, private link
                <img src={view.url} alt={record.name} className="max-h-[60dvh] w-auto max-w-full object-contain" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-paper/45" />
              )}
            </div>
          ) : kind === "text" ? (
            <TextPreview path={record.path} />
          ) : kind === "pdf" ? (
            <div className="space-y-2">
              {view.url ? (
                <iframe
                  src={view.url}
                  title={record.name}
                  className="hidden h-[60dvh] w-full rounded-xl border border-line bg-white sm:block"
                />
              ) : (
                <div className="hidden h-40 place-items-center rounded-xl border border-line sm:grid">
                  <Loader2 className="h-5 w-5 animate-spin text-paper/45" />
                </div>
              )}
              <p className="text-[0.72rem] text-paper/50 sm:hidden">
                Use Open to read it in your browser&apos;s PDF viewer.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-4 rounded-xl border border-line bg-paper/[0.03] p-5">
              <FileThumb record={record} size={56} />
              <p className="text-sm text-paper/70">
                This kind of file can&apos;t be shown here. Download it to open it with the right app.
              </p>
            </div>
          )}

          <div>
            <p className="eyebrow mb-2">Where it&apos;s used</p>
            <ul className="space-y-1.5 text-sm">
              {(refs?.journal ?? []).map((d) => (
                <li key={`j-${d}`}>
                  <Link href={`/journal/${d}`} onClick={onClose} className="inline-flex items-center gap-2 text-paper/80 hover:text-accent">
                    <NotebookPen className="h-3.5 w-3.5 text-paper/45" /> Journal · {formatDate(d)}
                  </Link>
                </li>
              ))}
              {(refs?.goals ?? []).map((g) => (
                <li key={`g-${g.id}`}>
                  <Link href={`/goals?goal=${encodeURIComponent(g.id)}`} onClick={onClose} className="inline-flex items-center gap-2 text-paper/80 hover:text-accent">
                    <Target className="h-3.5 w-3.5 text-paper/45" /> Goal · {g.title}
                  </Link>
                </li>
              ))}
              {(refs?.life ?? []).map((d) => (
                <li key={`l-${d}`}>
                  <Link href={`/wellbeing?date=${d}`} onClick={onClose} className="inline-flex items-center gap-2 text-paper/80 hover:text-accent">
                    <HeartPulse className="h-3.5 w-3.5 text-paper/45" /> Life Dashboard · {formatDate(d)}
                  </Link>
                </li>
              ))}
              {!refs?.journal.length && !refs?.goals.length && !refs?.life.length && (
                <li className="flex items-center gap-2 text-paper/50">
                  <FileText className="h-3.5 w-3.5" /> Not saved to a journal day yet.
                </li>
              )}
            </ul>
            <p className="mt-2 text-[0.7rem] text-paper/45">
              Added {formatDate(record.addedAt.slice(0, 10))}. Stored privately: only you can open it.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
