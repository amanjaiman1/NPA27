"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, CircleDashed, Clock3, ListChecks, Lock, RefreshCw, RotateCcw, Wrench, X } from "lucide-react";
import { useOverlayLayer } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useMounted } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { adminFetch, useAdminRefreshState } from "@/lib/platform/client";
import {
  adminResource,
  getAdminRefreshSnapshot,
  refreshAdminData,
  retryAdminResource,
  type AdminRefreshSnapshot,
  type AdminResourceId,
  type RefreshSummary,
  type ResourceStatus,
  type UpdateKind,
} from "@/lib/platform/admin-refresh";
import type { Permission } from "@/lib/platform/roles";
import { useAdminActor } from "./admin-context";

/* ════════════════════════════════════════════════════════════════
   REFRESH DATA, IN THE HEADER
   One button for the whole Admin Center (lib/platform/admin-refresh.ts
   does the work), how fresh what's on screen is, and a panel with what
   came of each kind of data. Nothing here reloads the page: only the
   data changes, so filters, pages, open sections and anything being
   typed stay as they are.
   ════════════════════════════════════════════════════════════════ */

/** The administrator's own clock and time zone, to the second. */
const timeOf = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const at = (t: number) => timeOf.format(new Date(t));

/** "0.4 s", "2.1 s", "under 0.1 s". */
const took = (ms: number) => (ms < 100 ? "under 0.1 s" : `${(ms / 1000).toFixed(1)} s`);

/** How long the button shows how it went before it's ready again. */
const FLASH_MS = { success: 2_200, partial: 4_000, failed: 4_000 } as const;

const KIND_TEXT: Record<UpdateKind, string> = {
  refresh: "By Refresh Data",
  live: "Updated live, as it changed",
  opened: "When it opened",
  reloaded: "After a change made here",
};

const names = (ids: readonly AdminResourceId[]) => ids.map((id) => adminResource(id).label).join(", ");

type Tone = "ok" | "warn" | "busy" | "muted";

/** What the header says about the data on screen. */
function freshness(snap: AdminRefreshSnapshot, can: (p: Permission) => boolean): { text: string; detail: string; tone: Tone } {
  if (snap.running) return { text: "Refreshing…", detail: "Asking the server again for everything on screen.", tone: "busy" };
  const shown = snap.resources.filter((r) => r.id !== "role" && r.views > 0 && can(r.permission));
  if (snap.last) {
    // What the last refresh couldn't bring, and still hasn't: a later load (live, a retry,
    // the page opened again) puts it right, and then the warning goes.
    const failed = snap.last.failed.filter((id) => snap.resources.find((r) => r.id === id)?.state === "failed");
    return failed.length
      ? { text: `Refreshed ${at(snap.last.finishedAt)}`, detail: `${failed.length} couldn't be refreshed: ${names(failed)}.`, tone: "warn" }
      : { text: `Refreshed ${at(snap.last.finishedAt)}`, detail: "Everything on screen came back fresh.", tone: "ok" };
  }
  if (shown.some((r) => r.state === "failed")) return { text: "Couldn't load everything", detail: "Some of what's on screen didn't load.", tone: "warn" };
  const times = shown.map((r) => r.updatedAt).filter((t): t is number => t !== null);
  if (!times.length) return { text: "Loading…", detail: "Loading what's on screen.", tone: "busy" };
  // The oldest: everything on screen is at least this fresh.
  return { text: `Updated ${at(Math.min(...times))}`, detail: "What's on screen updates by itself as things change.", tone: "muted" };
}

const DOT: Record<Tone, string> = {
  ok: "bg-positive",
  warn: "bg-warning",
  busy: "bg-accent",
  muted: "bg-paper/40",
};

/** Runs Refresh Data (or one retry) and says how it went. */
function useRefreshActions(openDetails: () => void) {
  const { can } = useAdminActor();
  const toast = useToast();
  const [flash, setFlash] = useState<RefreshSummary["outcome"] | null>(null);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const show = useCallback((outcome: RefreshSummary["outcome"]) => {
    window.clearTimeout(timer.current);
    setFlash(outcome);
    timer.current = window.setTimeout(() => setFlash(null), FLASH_MS[outcome]);
  }, []);

  const refreshAll = useCallback(async () => {
    // Pressed again while it runs: the run under way already answers, once. (While a retry
    // runs, this waits for it and then refreshes everything.)
    const now = getAdminRefreshSnapshot();
    if (now.running && now.runningOnly === null) return;
    let summary: RefreshSummary;
    try {
      summary = await refreshAdminData({ can, fetch: adminFetch });
    } catch {
      return; // the session ended meanwhile: there's nothing left to say it to
    }
    // The role was removed or the session ended: the screen that replaces this one says so.
    if (summary.ended) return;
    show(summary.outcome);
    const details = { label: "Details", onClick: openDetails };
    if (summary.outcome === "success") {
      toast({ title: "Admin data refreshed successfully.", description: `Up to date as of ${at(summary.finishedAt)}.`, tone: "success" });
    } else if (summary.offline) {
      toast({ title: "Couldn't reach the server. Your existing data is still available.", description: "Check the connection, then refresh again.", tone: "error", action: details });
    } else if (summary.outcome === "failed") {
      toast({ title: "The data couldn't be refreshed. Your existing data is still available.", description: `Not refreshed: ${names(summary.failed)}.`, tone: "error", action: details });
    } else {
      toast({
        title: "Some information could not be refreshed. Your existing data is still available.",
        description: `Not refreshed: ${names(summary.failed)}.`,
        tone: "error",
        action: details,
      });
    }
  }, [can, openDetails, show, toast]);

  const retry = useCallback(
    async (id: AdminResourceId) => {
      let summary: RefreshSummary;
      try {
        summary = await retryAdminResource(id, { can, fetch: adminFetch });
      } catch {
        return;
      }
      if (summary.ended) return;
      // How this resource came out, whatever else the run covered.
      const label = adminResource(id).label;
      if (summary.updated.includes(id)) toast({ title: `${label} refreshed.`, description: `Up to date as of ${at(summary.finishedAt)}.`, tone: "success" });
      else if (summary.skipped.includes(id)) toast({ title: `${label} isn't part of your role any more.`, tone: "info" });
      else if (summary.unopened.includes(id)) toast({ title: `${label} isn't open now.`, description: "It loads fresh when you open it.", tone: "info" });
      else if (summary.unavailable.includes(id)) toast({ title: `${label} isn't set up on this project yet.`, tone: "info" });
      else toast({ title: `${label} still couldn't be refreshed.`, description: "What you see is the last that loaded.", tone: "error" });
    },
    [can, toast],
  );

  return { refreshAll, retry, flash };
}

/**
 * The header's control: how fresh what's on screen is (it opens the
 * panel), and Refresh Data. Compact on a phone: two round buttons.
 */
export function RefreshDataControl() {
  const snap = useAdminRefreshState();
  const { can } = useAdminActor();
  const mounted = useMounted();
  const [panel, setPanel] = useState(false);
  const statusButton = useRef<HTMLButtonElement>(null);
  const openDetails = useCallback(() => setPanel(true), []);
  const closeDetails = useCallback(() => {
    setPanel(false);
    statusButton.current?.focus();
  }, []);
  const { refreshAll, retry, flash } = useRefreshActions(openDetails);
  const fresh = freshness(snap, can);
  const running = snap.running;
  const view = running ? "running" : (flash ?? "idle");
  const visible = running ? "Refreshing…" : view === "success" ? "Up to date" : view === "partial" ? "Partly refreshed" : view === "failed" ? "Not refreshed" : "Refresh Data";
  // The name says what's on the button, so speech and sight agree.
  const name = running ? "Refreshing admin data" : view === "idle" ? "Refresh Data" : `Refresh Data. ${visible}`;

  return (
    // The last run's number and outcome, for anything that needs to know a refresh finished (the e2e test).
    <div className="flex shrink-0 items-center gap-1" data-refresh-control data-refresh-run={snap.last?.id ?? 0} data-refresh-outcome={snap.last?.outcome ?? ""}>
      <button
        ref={statusButton}
        type="button"
        onClick={() => setPanel((p) => !p)}
        aria-haspopup="dialog"
        aria-expanded={panel}
        aria-label={`Refresh details. ${fresh.text}. ${fresh.detail}`}
        className={cn(
          "relative inline-flex h-10 shrink-0 items-center gap-2 rounded-full text-paper/65 transition-colors hover:bg-[var(--nav-hover)] hover:text-paper",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
          "w-10 justify-center md:w-auto md:px-3",
        )}
      >
        {/* On a phone the shape says it too, not only the dot's colour. */}
        {fresh.tone === "warn" ? (
          <AlertTriangle className="h-[1.1rem] w-[1.1rem] text-warning md:hidden" aria-hidden />
        ) : (
          <ListChecks className="h-[1.1rem] w-[1.1rem] md:hidden" aria-hidden />
        )}
        <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full max-md:absolute max-md:right-2 max-md:top-2", DOT[fresh.tone], fresh.tone === "busy" && "animate-pulse")} />
        <span className="tabular hidden whitespace-nowrap text-xs font-medium md:inline">{fresh.text}</span>
        <ChevronDown className={cn("hidden h-3.5 w-3.5 transition-transform md:block", panel && "rotate-180")} aria-hidden />
      </button>
      <button
        type="button"
        data-refresh-button
        onClick={() => void refreshAll()}
        aria-disabled={running}
        aria-busy={running}
        aria-label={name}
        className={cn(
          "lg-clear inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border text-sm font-semibold tracking-snugg",
          "transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
          "w-10 sm:w-auto sm:px-4",
          view === "success" ? "border-positive/40 text-positive" : view === "partial" || view === "failed" ? "border-warning/45 text-warning" : "border-line text-paper",
          running ? "cursor-progress" : "hover:-translate-y-px hover:border-paper/25 active:translate-y-0 active:scale-[0.97]",
        )}
      >
        {view === "success" ? (
          <Check className="h-4 w-4" aria-hidden />
        ) : view === "partial" || view === "failed" ? (
          <AlertTriangle className="h-4 w-4" aria-hidden />
        ) : (
          <RefreshCw className={cn("h-4 w-4", running && "animate-spin")} aria-hidden />
        )}
        <span className="hidden whitespace-nowrap sm:inline">{visible}</span>
      </button>
      {mounted &&
        createPortal(
          <MotionConfig reducedMotion="user">
            <AnimatePresence>
              {panel && <RefreshPanel snap={snap} onClose={closeDetails} onRefresh={() => void refreshAll()} onRetry={(id) => void retry(id)} />}
            </AnimatePresence>
          </MotionConfig>,
          document.body,
        )}
    </div>
  );
}

function StateIcon({ state }: { state: ResourceStatus["state"] }) {
  const base = "mt-0.5 h-4 w-4 shrink-0";
  switch (state) {
    case "updated":
      return <CheckCircle2 className={cn(base, "text-positive")} aria-hidden />;
    case "failed":
      return <AlertTriangle className={cn(base, "text-warning")} aria-hidden />;
    case "refreshing":
    case "loading":
      return <RefreshCw className={cn(base, "animate-spin text-accent")} aria-hidden />;
    case "skipped":
      return <Lock className={cn(base, "text-paper/45")} aria-hidden />;
    case "unavailable":
      return <Wrench className={cn(base, "text-paper/45")} aria-hidden />;
    default:
      return <CircleDashed className={cn(base, "text-paper/40")} aria-hidden />;
  }
}

/** What a resource's row says: the state, then the detail. */
function rowText(r: ResourceStatus): { state: string; detail: string } {
  switch (r.state) {
    case "updated":
      return { state: r.updatedAt ? `Updated ${at(r.updatedAt)}` : "Updated", detail: [r.updatedBy ? KIND_TEXT[r.updatedBy] : r.covers, r.note].filter(Boolean).join(" · ") };
    case "refreshing":
      return { state: "Refreshing…", detail: r.covers };
    case "loading":
      return { state: "Loading…", detail: r.covers };
    case "failed":
      return {
        state: "Not refreshed",
        detail: `${r.problem ?? "It couldn't be refreshed."}${r.updatedAt ? ` Showing what loaded at ${at(r.updatedAt)}.` : ""}`,
      };
    case "skipped":
      return { state: "Not in your role", detail: r.problem ?? "Your role doesn't include it." };
    case "unavailable":
      return { state: "Not set up", detail: r.problem ?? "Not set up on this project yet." };
    default:
      return { state: "Not open", detail: "Loads fresh when you open it." };
  }
}

/**
 * What came of each kind of data: on screen, with its state and time,
 * a way to retry what failed; then what isn't open and what isn't part
 * of the role, in a line each. A sheet at the bottom on a phone.
 */
function RefreshPanel({
  snap,
  onClose,
  onRefresh,
  onRetry,
}: {
  snap: AdminRefreshSnapshot;
  onClose: () => void;
  onRefresh: () => void;
  onRetry: (id: AdminResourceId) => void;
}) {
  const { can } = useAdminActor();
  const panel = useRef<HTMLDivElement>(null);
  const fresh = freshness(snap, can);
  // Part of the same stack as every Modal: one opened over the panel gets the keys first.
  const isTop = useOverlayLayer(true);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const box = panel.current;
      if (!box || !isTop()) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      // Keep Tab inside the panel while it's open.
      const items = Array.from(box.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement;
      if (!box.contains(at) || (e.shiftKey && (at === first || at === box)) || (!e.shiftKey && at === last)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, isTop]);

  const inRole = snap.resources.filter((r) => can(r.permission));
  // On screen, or something worth saying about it: each gets a row. The rest, a line.
  const rows = inRole.filter((r) => r.views > 0 || r.state === "failed" || r.state === "refreshing" || r.state === "unavailable" || r.state === "skipped");
  const closed = inRole.filter((r) => !rows.includes(r));
  const outside = snap.resources.filter((r) => !can(r.permission));

  return (
    <>
      <motion.div
        className="fixed inset-0 z-[55] bg-scrim/40 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Refresh details"
        tabIndex={-1}
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        // Under the header, on a phone too: the toasts that report a refresh appear at the
        // bottom of the screen, and mustn't cover the panel's own Refresh Data.
        className={cn(
          "fixed inset-x-2 top-[4.6rem] z-[56] flex max-h-[calc(100dvh-10rem)] flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-lift outline-none",
          "sm:inset-x-auto sm:right-3 sm:max-h-[calc(100dvh-5.5rem)] sm:w-[24rem] lg:right-4 lg:top-[5rem]",
        )}
      >
        <div className="flex items-start gap-3 border-b border-line px-4 py-3.5">
          <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[fresh.tone])} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-paper">{fresh.text}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-paper/60">
              {snap.last
                ? `${fresh.detail} It took ${took(snap.last.finishedAt - snap.last.startedAt)}.`
                : "Not refreshed by hand yet. What's on screen updates by itself as things change."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close refresh details"
            className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-paper/55 transition-colors hover:bg-[var(--nav-hover)] hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows.length > 0 && (
            <ul aria-label="On screen" className="divide-y divide-line">
              {rows.map((r) => {
                const t = rowText(r);
                return (
                  <li key={r.id} className="flex items-start gap-3 px-4 py-2.5" data-resource={r.id} data-state={r.state}>
                    <StateIcon state={r.state} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-medium text-paper">{r.label}</span>
                        <span className={cn("tabular shrink-0 text-xs font-medium", r.state === "failed" ? "text-warning" : "text-paper/60")}>{t.state}</span>
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-paper/50">{t.detail}</p>
                      {r.state === "failed" && (
                        <button
                          type="button"
                          // aria-disabled, not disabled: the button keeps focus while a run is going.
                          onClick={() => !snap.running && onRetry(r.id)}
                          aria-disabled={snap.running}
                          className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 aria-disabled:cursor-progress aria-disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3" aria-hidden /> Retry {r.label}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {(closed.length > 0 || outside.length > 0) && (
            <div className="space-y-2.5 border-t border-line px-4 py-3 text-xs leading-relaxed text-paper/55">
              {closed.length > 0 && (
                <p className="flex items-start gap-2">
                  <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-paper/40" aria-hidden />
                  <span>
                    <span className="font-medium text-paper/70">Not open now:</span> {names(closed.map((r) => r.id))}. Nothing of them is kept while
                    they&apos;re closed, so each loads fresh when you open it.
                  </span>
                </p>
              )}
              {outside.length > 0 && (
                <p className="flex items-start gap-2">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-paper/40" aria-hidden />
                  <span>
                    <span className="font-medium text-paper/70">Not part of your role:</span> {names(outside.map((r) => r.id))}. Never asked for.
                  </span>
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
          <p className="text-[0.7rem] leading-snug text-paper/45">Times are this device&apos;s, to the second.</p>
          <button
            type="button"
            onClick={onRefresh}
            aria-disabled={snap.running}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-accent px-3.5 text-xs font-semibold text-accent-fg shadow-accent transition-all hover:brightness-[1.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 aria-disabled:cursor-progress aria-disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", snap.running && "animate-spin")} aria-hidden />
            {snap.running ? "Refreshing…" : "Refresh Data"}
          </button>
        </div>
      </motion.div>
    </>
  );
}
