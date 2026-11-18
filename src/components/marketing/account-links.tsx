"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** Where Supabase keeps the session (lib/supabase.ts → AUTH_STORAGE_KEY). */
const SESSION_KEY = "upsc-chronicle-auth";

/**
 * The header's sign-in and sign-up links, or "Open dashboard" for someone who
 * is already signed in on this browser.
 *
 * It only peeks at whether a session is stored. It loads nothing from the app,
 * so the public pages stay light. The server always renders the signed-out
 * links, which is what crawlers see.
 */
export function AccountLinks({ compact = false }: { compact?: boolean }) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
      setSignedIn(Boolean(session?.user?.id));
    } catch {
      setSignedIn(false);
    }
  }, []);

  const primary =
    "inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold tracking-snugg text-accent-fg shadow-accent transition-all hover:-translate-y-px hover:brightness-[1.08]";

  // Plain strings, not cn(): this runs in the browser on every public page, and
  // tailwind-merge would add its weight to all of them.
  if (signedIn) {
    return (
      <Link href="/dashboard" className={compact ? `${primary} w-full` : primary}>
        Open dashboard <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    );
  }

  return (
    <div className={compact ? "flex w-full flex-col items-stretch gap-2" : "flex items-center gap-2"}>
      <Link
        href="/login"
        className="lg-clear inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-semibold tracking-snugg text-paper/80 transition-all hover:text-paper"
      >
        Sign in
      </Link>
      <Link href="/signup" data-track="cta_header" className={primary}>
        Start free
      </Link>
    </div>
  );
}
