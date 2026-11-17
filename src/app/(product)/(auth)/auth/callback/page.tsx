"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { AuthCard, AuthPending, AuthMessage } from "@/components/auth/auth-ui";
import { initialAuthRedirect } from "@/lib/supabase";
import { describeAuthError } from "@/lib/auth-errors";

/** Where the email-confirmation link lands. */
export default function AuthCallbackPage() {
  const auth = useAuth();
  const router = useRouter();
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    if (auth.status === "signedIn") router.replace("/dashboard");
  }, [auth.status, router]);

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 5_000);
    return () => clearTimeout(t);
  }, []);

  if (initialAuthRedirect?.error) {
    return (
      <AuthCard title="This link can't be used">
        <div className="space-y-4">
          <AuthMessage tone="error">
            {describeAuthError({
              code: initialAuthRedirect.errorCode ?? undefined,
              message: initialAuthRedirect.error,
            })}
          </AuthMessage>
          <p className="text-sm text-paper/60">
            If you already confirmed your email, just sign in. Otherwise, sign in and we&apos;ll
            offer to send a fresh link.
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

  if (waited && auth.status === "signedOut") {
    return (
      <AuthCard title="Email confirmed" subtitle="Sign in to open your chronicle.">
        <Link
          href="/login"
          className="inline-flex h-12 w-full items-center justify-center rounded-full bg-accent px-6 text-[0.95rem] font-semibold text-accent-fg shadow-accent"
        >
          Sign in
        </Link>
      </AuthCard>
    );
  }

  return <AuthPending label="Confirming your email…" />;
}
