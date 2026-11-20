"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard, AuthMessage, AuthPending } from "@/components/auth/auth-ui";
import { landingAfterSignIn } from "@/components/auth/landing";
import { describeAuthError } from "@/lib/auth-errors";
import { supabase } from "@/lib/supabase";

/**
 * Where /auth/confirm hands on a confirmation link. Verifies the token with
 * the app's own browser client, which stores the session where every other
 * sign-in does, then goes the way /auth/callback goes: a Super Admin to the
 * Admin Center, everyone else to the dashboard (and first-run setup there).
 * Confirming only marks the email confirmed; it creates and resets nothing.
 */
export default function AuthVerifyPage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Taken from the fragment, then removed from the address bar straight away.
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    window.history.replaceState(null, "", window.location.pathname);
    const tokenHash = params.get("token_hash");
    const type = params.get("type") === "signup" ? "signup" : "email";
    if (!tokenHash || !supabase) {
      setError(describeAuthError({ code: "otp_invalid" }));
      return;
    }
    void supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(async ({ data, error: failed }) => {
      if (failed || !data.user) {
        // Expired and already-used links both say so; anything else is a general failure, never the raw message.
        const code = failed && /expired|used/i.test(`${failed.code ?? ""} ${failed.message}`) ? "otp_expired" : failed?.code ?? "otp_invalid";
        setError(describeAuthError({ code }));
        return;
      }
      router.replace(await landingAfterSignIn(data.user.id, null));
    });
  }, [router]);

  if (error) {
    return (
      <AuthCard title="This link can't be used">
        <div className="space-y-4">
          <AuthMessage tone="error">{error}</AuthMessage>
          <p className="text-sm text-paper/60">
            If you already confirmed your email, just sign in. Otherwise, sign in and we&apos;ll offer to send a fresh
            confirmation email.
          </p>
          <Link
            href="/login"
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-accent px-6 text-[0.95rem] font-semibold text-accent-fg shadow-accent"
          >
            Go to sign in
          </Link>
        </div>
      </AuthCard>
    );
  }
  return <AuthPending label="Confirming your email…" />;
}
