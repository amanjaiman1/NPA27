"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { promptInstall, registerServiceWorker, useInstallState, type ManualInstall } from "@/lib/pwa";

/* ════════════════════════════════════════════════════════════════
   INSTALLING FROM THE PUBLIC SITE
   The website is where people arrive, so it is where the app has to
   be installable from. These pieces register the service worker and
   offer the install, without loading any of the app itself: they
   import only lib/pwa.ts. The home page's own offer is in
   install-app-inline.tsx (why it is a separate file is noted there).

   Plain class strings rather than cn(): this runs on every public
   page, and tailwind-merge would add its weight to all of them.
   ════════════════════════════════════════════════════════════════ */

/**
 * Registers the service worker on the public pages, after the page has
 * loaded. With it, browsers offer to install the site, and pages already
 * visited open without a connection. Renders nothing.
 */
export function SiteServiceWorker() {
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  return null;
}

/** The steps for a browser with no install dialog. */
function ManualSteps({ manual }: { manual: Exclude<ManualInstall, null> }) {
  if (manual === "mac-safari") {
    return (
      <p className="text-sm leading-relaxed text-paper/75">
        In Safari&apos;s menu bar, choose <span className="font-semibold text-paper">File</span>, then{" "}
        <span className="font-semibold text-paper">Add to Dock</span>.
      </p>
    );
  }
  return (
    <ol className="space-y-2 text-sm text-paper/75">
      <li className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent" aria-hidden>
          <Share className="h-3.5 w-3.5" />
        </span>
        <span>
          Tap <span className="font-semibold text-paper">Share</span> in your browser
        </span>
      </li>
      <li className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent" aria-hidden>
          <SquarePlus className="h-3.5 w-3.5" />
        </span>
        <span>
          Choose <span className="font-semibold text-paper">Add to Home Screen</span>
        </span>
      </li>
    </ol>
  );
}

/**
 * "Install app" in the site header. Shown only where it can help: when the
 * browser is ready to install (Chrome, Edge, Android), on an iPhone or iPad,
 * and in Safari on a Mac, where it explains the steps instead. Hidden once
 * the app is installed, and on the server, which can't know.
 */
export function InstallAppButton() {
  const { canPrompt, manual } = useInstallState();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!canPrompt && !manual) return null;

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        data-track="install_header"
        onClick={() => (canPrompt ? void promptInstall() : setOpen((o) => !o))}
        aria-label="Install app"
        aria-expanded={canPrompt ? undefined : open}
        aria-controls={canPrompt ? undefined : panelId}
        className="lg-clear inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold tracking-snugg text-paper/80 transition-all hover:text-paper"
      >
        <Download className="h-4 w-4" aria-hidden />
        {/* One word on the narrowest phones, so it never wraps beside the logo. */}
        <span aria-hidden>
          Install<span className="hidden min-[400px]:inline"> app</span>
        </span>
      </button>
      {open && manual && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Install DoOrDie"
          className="absolute right-0 top-12 z-50 w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-line bg-card p-4 shadow-lift"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-paper">Install DoOrDie</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="-mr-1 -mt-1 grid h-7 w-7 place-items-center rounded-full text-paper/50 hover:text-paper"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          <ManualSteps manual={manual} />
          <p className="mt-3 text-xs leading-relaxed text-paper/55">
            It opens full screen, like any other app, and keeps working offline.
          </p>
        </div>
      )}
    </div>
  );
}
