"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck, UserPlus } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  AuthCard,
  AuthField,
  AuthMessage,
  PasswordInput,
  SubmitButton,
} from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { emailProblem, passwordProblem } from "@/lib/auth-errors";

type Errors = Partial<Record<"name" | "email" | "password" | "confirm", string>>;

export default function SignupPage() {
  const { signUp, resendConfirmation } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  function validate(): Errors {
    return {
      name: name.trim() ? (name.trim().length > 60 ? "Keep it under 60 characters." : undefined) : "Enter your name.",
      email: emailProblem(email) ?? undefined,
      password: passwordProblem(password) ?? undefined,
      confirm: confirm === password ? undefined : "The passwords don't match.",
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    setBusy(true);
    setError(null);
    const result = await signUp({ name, email, password });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.needsConfirmation) setSentTo(email.trim());
    // Otherwise the session exists and the auth layout moves on to setup.
  }

  if (sentTo) {
    return (
      <AuthCard title="Check your inbox" subtitle={<>We sent a confirmation link to <span className="font-medium text-paper/85">{sentTo}</span>.</>}>
        <div className="space-y-4">
          <div className="flex justify-center py-2">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-accent/[0.12] text-accent">
              <MailCheck className="h-6 w-6" />
            </span>
          </div>
          <p className="text-center text-sm leading-relaxed text-paper/60">
            Open it on this device to finish creating your account. It can take a minute,
            and sometimes lands in spam.
          </p>
          {resent && <AuthMessage tone="success">Sent again.</AuthMessage>}
          {error && <AuthMessage tone="error">{error}</AuthMessage>}
          <Button
            variant="ghost"
            className="w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await resendConfirmation(sentTo);
              setBusy(false);
              setResent(!r.error);
              setError(r.error ?? null);
            }}
          >
            Send it again
          </Button>
          <p className="text-center text-sm">
            <Link href="/login" className="font-semibold text-accent hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </AuthCard>
    );
  }

  const describe = (id: keyof Errors) => (errors[id] ? `${id}-error` : undefined);

  return (
    <AuthCard
      title="Create your account"
      subtitle="Your own private chronicle, synced across your devices."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <AuthField id="name" label="Your name" error={errors.name}>
          <Input
            id="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            maxLength={60}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describe("name")}
            autoFocus
          />
        </AuthField>
        <AuthField id="email" label="Email" error={errors.email}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={describe("email")}
          />
        </AuthField>
        <AuthField id="password" label="Password" error={errors.password} hint="At least 8 characters, with letters and numbers.">
          <PasswordInput
            id="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={describe("password") ?? "password-hint"}
          />
        </AuthField>
        <AuthField id="confirm" label="Confirm password" error={errors.confirm}>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={Boolean(errors.confirm)}
            aria-describedby={describe("confirm")}
          />
        </AuthField>

        {error && <AuthMessage tone="error">{error}</AuthMessage>}

        <SubmitButton busy={busy}>
          {!busy && <UserPlus className="h-4 w-4" />}
          {busy ? "Creating your account…" : "Create account"}
        </SubmitButton>
      </form>
    </AuthCard>
  );
}
