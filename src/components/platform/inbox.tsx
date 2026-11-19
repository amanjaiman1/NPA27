"use client";

/* ════════════════════════════════════════════════════════════════
   FROM THE TEAM
   Announcements, the app-wide notice and "the team answered your
   feedback", for the signed-in account. One database call when the app
   opens, and again when the tab comes back after 15 minutes or more: no
   polling and no Realtime, so it costs next to nothing on the free plan.
   Read and dismissed state is kept per account in the database
   (platform_announcement_reads), so it follows the person between devices.
   ════════════════════════════════════════════════════════════════ */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { MyAnnouncement, MyAnnouncements } from "@/lib/platform/types";

const REFRESH_AFTER = 15 * 60_000;

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
}

const InboxContext = createContext<InboxValue | null>(null);

/** Null without an account (this device only, or no Supabase). */
export const useInbox = () => useContext(InboxContext);

const EMPTY: MyAnnouncements = { notice: null, unseenResponses: 0, items: [] };

export function PlatformInbox({ userId, children }: { userId: string | null; children: React.ReactNode }) {
  const [state, setState] = useState<MyAnnouncements>(EMPTY);
  const last = useRef(0);

  const load = useCallback(async () => {
    if (!userId || !supabase) return;
    last.current = Date.now();
    const { data, error } = await supabase.rpc("platform_my_announcements");
    // Not set up yet, or offline: show nothing rather than an error, and ask again later.
    if (error || !data) return;
    const d = data as Partial<MyAnnouncements>;
    setState({ notice: d.notice ?? null, unseenResponses: Number(d.unseenResponses ?? 0), items: Array.isArray(d.items) ? d.items : [] });
  }, [userId]);

  useEffect(() => {
    setState(EMPTY);
    if (!userId) return;
    void load();
    const again = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current >= REFRESH_AFTER) void load();
    };
    document.addEventListener("visibilitychange", again);
    window.addEventListener("focus", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("focus", again);
    };
  }, [userId, load]);

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
    };
  }, [state, patch]);

  return <InboxContext.Provider value={userId ? value : null}>{children}</InboxContext.Provider>;
}
