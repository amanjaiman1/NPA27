"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ImagePlus, X, FileText, Loader2, Maximize2 } from "lucide-react";
import type { Attachment } from "@/lib/types";
import { filesToAttachments } from "@/lib/media";
import { useMounted } from "@/lib/hooks";

/* ── Editor: upload + manage attachments ─────────────────────── */

export function AttachmentField({
  attachments,
  onChange,
}: {
  attachments: Attachment[];
  onChange: (a: Attachment[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const next = await filesToAttachments(files);
      onChange([...attachments, ...next]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function setCaption(id: string, caption: string) {
    onChange(attachments.map((a) => (a.id === id ? { ...a, caption } : a)));
  }
  function remove(id: string) {
    onChange(attachments.filter((a) => a.id !== id));
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-paper/15 bg-paper/[0.02] py-6 text-paper/45 transition-colors hover:border-paper/30 hover:text-paper/70"
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <ImagePlus className="h-5 w-5" />
        )}
        <span className="text-xs">
          {busy ? "Processing…" : "Add photos or screenshots"}
        </span>
        <span className="text-[0.65rem] text-paper/30">
          Images are compressed automatically
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {attachments.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="group relative overflow-hidden rounded-xl border border-paper/10 bg-paper/[0.03]"
            >
              <div className="relative aspect-[4/3] w-full bg-ink">
                {a.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.dataUrl}
                    alt={a.caption || a.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-paper/40">
                    <FileText className="h-6 w-6" />
                    <span className="px-2 text-center text-[0.6rem]">{a.name}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-ink/80 text-paper/70 opacity-0 backdrop-blur transition-opacity hover:text-paper group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                value={a.caption ?? ""}
                onChange={(e) => setCaption(a.id, e.target.value)}
                placeholder="Add a caption…"
                className="w-full bg-transparent px-2.5 py-1.5 text-[0.7rem] text-paper/70 placeholder:text-paper/30 focus:outline-none"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Viewer: gallery with lightbox ───────────────────────────── */

export function AttachmentGallery({ attachments }: { attachments: Attachment[] }) {
  const mounted = useMounted();
  const [active, setActive] = useState<Attachment | null>(null);
  if (!attachments.length) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {attachments.map((a) => (
          <figure
            key={a.id}
            className="group overflow-hidden rounded-xl border border-paper/10 bg-paper/[0.03]"
          >
            <button
              type="button"
              onClick={() => a.kind === "image" && setActive(a)}
              className="relative block aspect-[4/3] w-full bg-ink"
            >
              {a.kind === "image" ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.dataUrl}
                    alt={a.caption || a.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <span className="absolute inset-0 grid place-items-center bg-ink/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <Maximize2 className="h-5 w-5 text-paper" />
                  </span>
                </>
              ) : (
                <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-paper/40">
                  <FileText className="h-6 w-6" />
                  <span className="px-2 text-center text-[0.6rem]">{a.name}</span>
                </span>
              )}
            </button>
            {a.caption && (
              <figcaption className="px-2.5 py-1.5 text-[0.7rem] text-paper/55">
                {a.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {active && (
              <motion.div
                className="fixed inset-0 z-[60] flex items-center justify-center p-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setActive(null)}
              >
                <div className="absolute inset-0 bg-ink/85 backdrop-blur-sm" />
                <motion.figure
                  initial={{ scale: 0.96, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.97, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="relative z-10 max-h-[88vh] max-w-3xl overflow-hidden rounded-2xl border border-paper/15"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={active.dataUrl}
                    alt={active.caption || active.name}
                    className="max-h-[80vh] w-full object-contain"
                  />
                  {active.caption && (
                    <figcaption className="bg-ink px-4 py-2.5 text-sm text-paper/70">
                      {active.caption}
                    </figcaption>
                  )}
                  <button
                    onClick={() => setActive(null)}
                    className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-ink/80 text-paper/80 backdrop-blur hover:text-paper"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </motion.figure>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
