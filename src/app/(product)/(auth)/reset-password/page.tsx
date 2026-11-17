"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  AuthCard,
  AuthPending,
  AuthField,
  AuthMessage,
  PasswordInput,
  SubmitButton,
} from "@/components/auth/auth-ui";
import { endPasswordRecovery, initialAuthRedirect, isPasswordRecovery } from "@/lib/supabase";
import { describeAuthError, passwordProblem } from "@/lib/auth-errors";

/** How long to wait for the link's session before calling the link invalid. */
const GRACE_MS = 4_000;

export default function ResetPasswordPage() {
  const auth = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), GRACE_MS);
    return () => clearTimeout(t);
  }, []);

  const linkError = initialAuthRedirect?.error
    ? describeAuthError({ code: initialAuthRedirect.errorCode ?? undefined, message: initialAuthRedirect.error })
    : null;
  const ready = auth.status === "signedIn" && isPasswordRecovery();

  if (linkError || (!ready && waited && auth.status !== "loading")) {
    return (
      <AuthCard title="This link can't be used" subtitle="Reset links work once and expire after an hour.">
        <div className="space-y-4">
          <AuthMessage tone="error">{linkError ?? "This reset link is invalid or has expired."}</AuthMessage>
          <Link
            href="/forgot-password"
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-accent px-6 text-[0.95rem] font-semibold text-accent-fg shadow-accent"
          >
            Send a new link
          </Link>
        </div>
      </AuthCard>
    );
  }
  if (!ready) return <AuthPending label="Checking your reset link…" />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = {
      password: passwordProblem(password) ?? undefined,
      confirm: confirm === password ? undefined : "The passwords don't match.",
    };
    setErrors(found);
    if (found.password || found.confirm) return;
    setBusy(true);
    setError(null);
    const result = await auth.updatePassword(password);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    endPasswordRecovery();
    router.replace("/dashboard");
  }

  return (
    <AuthCard title="Choose a new password" subtitle="You'll stay signed in on this device.">
      <form onSubmit={submit} noValidate className="space-y-4">
        <AuthField id="password" label="New password" error={errors.password} hint="At least 8 characters, with letters and numbers.">
          <PasswordInput
            id="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "password-error" : "password-hint"}
            autoFocus
          />
        </AuthField>
        <AuthField id="confirm" label="Confirm new password" error={errors.confirm}>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={Boolean(errors.confirm)}
            aria-describedby={errors.confirm ? "confirm-error" : undefined}
          />
        </AuthField>
        {error && <AuthMessage tone="error">{error}</AuthMessage>}
        <SubmitButton busy={busy}>
          {!busy && <KeyRound className="h-4 w-4" />}
          {busy ? "Saving…" : "Save new password"}
        </SubmitButton>
      </form>
    </AuthCard>
  );
}
