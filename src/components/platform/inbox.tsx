"use client";

/* ════════════════════════════════════════════════════════════════
   FROM THE TEAM
   Announcements, the app-wide notice, "the team answered your
   feedback" and whether to invite a review, for the signed-in account. One database call when the app
   opens, then again:
   - the moment the team changes any of them in the Admin Center (a live
     update, see live-updates.ts);
   - when a scheduled announcement starts or a running one ends, timed by
     the database's clock;
   - when the tab comes back after 15 minutes or more.
   No polling. Read and dismissed state is kept per account in the
   database (platform_announcement_reads), so it follows the person
   between devices.
   ════════════════════════════════════════════════════════════════ */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { MyAnnouncement, MyAnnouncements } from "@/lib/platform/types";
import { usePlatformUpdates } from "./live-updates";

const REFRESH_AFTER = 15 * 60_000;
/** A scheduled change is reloaded a moment after it happens, spread so every app doesn't ask at once. */
const AFTER_CHANGE_MS = 1_500;
const CHANGE_SPREAD_MS = 4_000;
/** Further off than this, opening or coming back to the app catches it instead. */
const LONGEST_WAIT_MS = 24 * 60 * 60_000;

export interface InboxValue {
  notice: MyAnnouncements["notice"];
  items: MyAnnouncement[];
  unseenResponses: number;
  /** Running, not read and not dismissed: what the bell counts. */
  unread: MyAnnouncement[];
  /** The newest of those, for the banner. */
  banner: MyAnnouncement | null;
  markRead: (id: string) => void;
  dismiss: (id: string) => void;
  markAllRead: () => void;
  /** The feedback list has shown the answers. */
  responsesSeen: () => void;
  /** The database says this account may be invited to review (see platform_review_invite_due). */
  reviewInvite: boolean;
  /** "Later" or "No thanks" on the invitation, or a review sent: stop showing it now. */
  answerInvite: (action: "postpone" | "dismiss" | "done") => void;
}

const InboxContext = createContext<InboxValue | null>(null);

/** Null without an account (this device only, or no Supabase). */
export const useInbox = () => useContext(InboxContext);

const EMPTY: MyAnnouncements = { notice: null, unseenResponses: 0, reviewInvite: false, items: [] };

export function PlatformInbox({ userId, children }: { userId: string | null; children: React.ReactNode }) {
  const [state, setState] = useState<MyAnnouncements>(EMPTY);
  const last = useRef(0);
  /** The reload at the next scheduled start or end. */
  const changeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Answers are applied in the order the calls were made, so a slow one can't undo a newer one. */
  const seq = useRef(0);
  /** False once the inbox has gone, so an answer still on its way sets no new timer. */
  const alive = useRef(false);
  const loadRef = useRef<() => Promise<void>>(async () => undefined);

  const load = useCallback(async () => {
    if (!userId || !supabase) return;
    last.current = Date.now();
    const call = ++seq.current;
    const { data, error } = await supabase.rpc("platform_my_announcements");
    // Not set up yet, or offline: show nothing rather than an error, and ask again later.
    if (error || !data || call !== seq.current || !alive.current) return;
    const d = data as Partial<MyAnnouncements>;
    setState({
      notice: d.notice ?? null,
      unseenResponses: Number(d.unseenResponses ?? 0),
      reviewInvite: d.reviewInvite === true,
      items: Array.isArray(d.items) ? d.items : [],
    });

    // Timed from the database's clock, so a phone set a few minutes wrong still gets it on time.
    if (changeTimer.current) clearTimeout(changeTimer.current);
    changeTimer.current = null;
    const wait = d.nextChangeAt && d.now ? Date.parse(d.nextChangeAt) - Date.parse(d.now) : NaN;
    if (Number.isFinite(wait) && wait < LONGEST_WAIT_MS) {
      changeTimer.current = setTimeout(
        () => {
          changeTimer.current = null;
          void loadRef.current();
        },
        Math.max(0, wait) + AFTER_CHANGE_MS + Math.random() * CHANGE_SPREAD_MS,
      );
    }
  }, [userId]);
  loadRef.current = load;

  useEffect(() => {
    setState(EMPTY);
    if (!userId) return;
    alive.current = true;
    void load();
    const again = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current >= REFRESH_AFTER) void load();
    };
    document.addEventListener("visibilitychange", again);
    window.addEventListener("focus", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("focus", again);
      alive.current = false;
      if (changeTimer.current) clearTimeout(changeTimer.current);
      changeTimer.current = null;
    };
  }, [userId, load]);

  // The team changed an announcement, the notice or an answer to feedback, or the review
  // settings (which decide the invitation to review): show it now.
  usePlatformUpdates(["announcements", "notice", "feedback", "reviews"], () => void load(), Boolean(userId));

  const patch = useCallback((ids: string[] | "all", fields: Partial<MyAnnouncement>) => {
    setState((s) => ({ ...s, items: s.items.map((a) => (ids === "all" || ids.includes(a.id) ? { ...a, ...fields } : a)) }));
  }, []);

  const value = useMemo<InboxValue>(() => {
    const now = new Date().toISOString();
    const unread = state.items.filter((a) => a.active && !a.readAt && !a.dismissedAt);
    // Fire and forget: the screen has already changed, and the next load corrects it if the call was lost.
    const call = (fn: string, args?: Record<string, unknown>) => {
      void supabase?.rpc(fn, args).then(
        () => undefined,
        () => undefined,
      );
    };
    return {
      ...state,
      unread,
      banner: unread[0] ?? null,
      markRead: (id) => {
        if (!state.items.some((a) => a.id === id && !a.readAt)) return;
        patch([id], { readAt: now });
        call("platform_mark_announcement", { p_id: id, p_action: "read" });
      },
      dismiss: (id) => {
        patch([id], { dismissedAt: now, readAt: state.items.find((a) => a.id === id)?.readAt ?? now });
        call("platform_mark_announcement", { p_id: id, p_action: "dismiss" });
      },
      markAllRead: () => {
        if (!state.items.some((a) => !a.readAt)) return;
        setState((s) => ({ ...s, items: s.items.map((a) => ({ ...a, readAt: a.readAt ?? now })) }));
        call("platform_mark_announcements_read");
      },
      responsesSeen: () => setState((s) => (s.unseenResponses ? { ...s, unseenResponses: 0 } : s)),
      answerInvite: (action) => {
        setState((s) => ({ ...s, reviewInvite: false }));
        // A review sent needs no call: the database stops inviting once a review exists.
        if (action !== "done") call("platform_review_invite", { p_action: action });
      },
    };
  }, [state, patch]);

  return <InboxContext.Provider value={userId ? value : null}>{children}</InboxContext.Provider>;
}
