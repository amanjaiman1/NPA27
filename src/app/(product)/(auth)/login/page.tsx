"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  AuthCard,
  AuthField,
  AuthMessage,
  PasswordInput,
  SubmitButton,
  queryParam,
} from "@/components/auth/auth-ui";
import { Input } from "@/components/ui/form";
import { emailProblem } from "@/lib/auth-errors";

export default function LoginPage() {
  const { signIn, resendConfirmation } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; code?: string } | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  useEffect(() => {
    if (queryParam("ended") === "1") setInfo("Your session ended. Sign in again to carry on.");
    if (queryParam("reset") === "1") setInfo("Password updated. Sign in with your new password.");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errors = {
      email: emailProblem(email) ?? undefined,
      password: password ? undefined : "Enter your password.",
    };
    setFieldErrors(errors);
    if (errors.email || errors.password) return;
    setBusy(true);
    setError(null);
    const result = await signIn(email, password);
    setBusy(false);
    if (result.error) setError({ text: result.error, code: result.code });
    // On success the auth layout moves on into the app.
  }

  async function resend() {
    setBusy(true);
    const result = await resendConfirmation(email);
    setBusy(false);
    if (result.error) setError({ text: result.error });
    else {
      setError(null);
      setInfo(`A new confirmation link is on its way to ${email.trim()}.`);
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to open your chronicle."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="font-semibold text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {info && <AuthMessage tone="info">{info}</AuthMessage>}
        <AuthField id="email" label="Email" error={fieldErrors.email}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            autoFocus
          />
        </AuthField>
        <AuthField
          id="password"
          label="Password"
          error={fieldErrors.password}
          aside={
            <Link href="/forgot-password" className="text-[0.72rem] font-medium text-accent hover:underline">
              Forgot password?
            </Link>
          }
        >
          <PasswordInput
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? "password-error" : undefined}
          />
        </AuthField>

        {error && (
          <AuthMessage tone="error">
            {error.text}
            {error.code === "email_not_confirmed" && (
              <button
                type="button"
                onClick={() => void resend()}
                className="mt-1 block font-semibold text-accent hover:underline"
              >
                Send the confirmation link again
              </button>
            )}
          </AuthMessage>
        )}

        <SubmitButton busy={busy}>
          {!busy && <LogIn className="h-4 w-4" />}
          {busy ? "Signing in…" : "Sign in"}
        </SubmitButton>
      </form>
    </AuthCard>
  );
}
