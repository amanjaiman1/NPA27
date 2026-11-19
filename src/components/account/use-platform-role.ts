"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { opensAdminCenter, type PlatformRole } from "@/lib/platform/roles";
import { checkRole, knownRole } from "@/lib/platform/my-role";

/**
 * The signed-in account's Admin Center role, to decide whether to show a
 * link to it. The database answers for the session's own account (the
 * `platform_my_role` function), at most once every few minutes, and this
 * browser remembers the answer (lib/platform/my-role.ts). Showing the link
 * grants nothing: the Admin Center checks again on the server for every
 * page and every request.
 */
export function usePlatformRole(userId: string | null | undefined): PlatformRole | null {
  const [role, setRole] = useState<PlatformRole | null>(null);
  useEffect(() => {
    if (!userId || !supabase) {
      setRole(null);
      return;
    }
    setRole(knownRole(userId)?.role ?? null);
    let live = true;
    void checkRole(userId).then((r) => {
      if (live && r !== undefined) setRole(r);
    });
    return () => {
      live = false;
    };
  }, [userId]);
  return role;
}

/** How long the app waits for a first answer before opening as a student account. */
const FIRST_ANSWER_WAIT_MS = 2_500;

export type AccountKind = "checking" | "admin" | "student";

/**
 * Whether the student app should open for this account, or send it to the
 * Admin Center (a Super Admin: see `opensAdminCenter`).
 *
 * Decided at once from the answer this browser remembers, and checked again
 * in the background. Only when this browser has never had an answer for the
 * account does the app wait for one, for at most a couple of seconds and
 * never while offline: a Super Admin's first visit then never shows student
 * setup or the dashboard, and a student waits once at most. After a sign-in
 * there is always an answer, since signing in asks.
 */
export function useAccountKind(userId: string | null): AccountKind {
  const remembered = useMemo(() => (userId ? knownRole(userId) : null), [userId]);
  const [asked, setAsked] = useState<{ id: string; role: PlatformRole | null | undefined } | null>(null);

  useEffect(() => {
    if (!userId || !supabase) return;
    let live = true;
    // With nothing remembered, stop waiting after a moment and open the app; a late answer still counts.
    const giveUp = remembered
      ? null
      : setTimeout(() => {
          if (live) setAsked((a) => (a?.id === userId ? a : { id: userId, role: undefined }));
        }, FIRST_ANSWER_WAIT_MS);
    void checkRole(userId).then((role) => {
      if (!live) return;
      if (giveUp) clearTimeout(giveUp);
      setAsked((a) => (role === undefined && a?.id === userId ? a : { id: userId, role }));
    });
    return () => {
      live = false;
      if (giveUp) clearTimeout(giveUp);
    };
  }, [userId, remembered]);

  if (!userId || !supabase) return "student";
  const answered = asked?.id === userId ? asked : null;
  const role = answered && answered.role !== undefined ? answered.role : remembered?.role;
  if (role === undefined) {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return answered || offline ? "student" : "checking";
  }
  return opensAdminCenter(role) ? "admin" : "student";
}
