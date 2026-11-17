"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { AuthCard, AuthField, AuthMessage, SubmitButton } from "@/components/auth/auth-ui";
import { Input } from "@/components/ui/form";
import { emailProblem } from "@/lib/auth-errors";

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = emailProblem(email);
    setFieldError(problem);
    if (problem) return;
    setBusy(true);
    setError(null);
    const result = await requestPasswordReset(email);
    setBusy(false);
    if (result.error) setError(result.error);
    else setSent(true);
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your account's email and we'll send a link to choose a new password."
      footer={
        <Link href="/login" className="font-semibold text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <AuthMessage tone="success">
          If an account exists for <span className="font-medium">{email.trim()}</span>, a reset link
          is on its way. It expires after an hour, so use it soon.
        </AuthMessage>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <AuthField id="email" label="Email" error={fieldError}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? "email-error" : undefined}
              autoFocus
            />
          </AuthField>
          {error && <AuthMessage tone="error">{error}</AuthMessage>}
          <SubmitButton busy={busy}>{busy ? "Sending…" : "Send reset link"}</SubmitButton>
        </form>
      )}
    </AuthCard>
  );
}
