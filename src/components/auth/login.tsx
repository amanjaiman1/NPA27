"use client";

import { useState } from "react";
import { Loader2, LogIn, UserPlus, MailCheck } from "lucide-react";
import { useAuth } from "./auth-provider";
import { Logo } from "@/components/layout/logo";

type Mode = "signin" | "signup";

export function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    const result =
      mode === "signin"
        ? await signIn(email, password)
        : await signUp(email, password);
    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.needsConfirmation) {
      setConfirmSent(true);
      return;
    }
    // On success the auth listener swaps this screen for the app.
  }

  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden px-4">
      {/* ambient bloom backdrop, matching the app shell */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-bloom-field" />
        <div className="absolute -left-24 top-[-6rem] h-80 w-80 animate-bloom-float rounded-full bg-bloom-1/25 blur-[90px]" />
        <div className="absolute right-[-5rem] bottom-10 h-72 w-72 animate-bloom-float-2 rounded-full bg-bloom-3/25 blur-[90px]" />
        <div className="bloom-scrim absolute inset-0" />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="h-11 w-11" />
          <h1 className="mt-4 font-display text-2xl text-paper">
            The UPSC Chronicle
          </h1>
          <p className="mt-1 text-sm text-paper/50">
            {mode === "signin"
              ? "Sign in to sync your chronicle across devices."
              : "Create your account to back up your chronicle."}
          </p>
        </div>

        {confirmSent ? (
          <div className="rounded-2xl border border-paper/10 bg-paper/[0.03] p-6 text-center">
            <MailCheck className="mx-auto h-8 w-8 text-accent" />
            <h2 className="mt-3 text-base font-medium text-paper">
              Check your inbox
            </h2>
            <p className="mt-1 text-sm text-paper/55">
              We sent a confirmation link to{" "}
              <span className="text-paper/80">{email}</span>. Confirm it, then
              come back and sign in.
            </p>
            <button
              onClick={() => {
                setConfirmSent(false);
                setMode("signin");
              }}
              className="mt-5 text-sm font-medium text-accent hover:underline"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-paper/10 bg-paper/[0.03] p-6 shadow-soft backdrop-blur-xl"
          >
            <label className="block text-xs font-medium text-paper/50">
              Email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1.5 w-full rounded-lg border border-paper/10 bg-ink/40 px-3 py-2.5 text-sm text-paper outline-none transition-colors placeholder:text-paper/25 focus:border-accent/60"
              />
            </label>

            <label className="mt-4 block text-xs font-medium text-paper/50">
              Password
              <input
                type="password"
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 w-full rounded-lg border border-paper/10 bg-ink/40 px-3 py-2.5 text-sm text-paper outline-none transition-colors placeholder:text-paper/25 focus:border-accent/60"
              />
            </label>

            {error && (
              <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg shadow-soft transition-all hover:opacity-90 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === "signin" ? (
                <LogIn className="h-4 w-4" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>

            <p className="mt-4 text-center text-xs text-paper/45">
              {mode === "signin" ? "First time here?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                }}
                className="font-medium text-accent hover:underline"
              >
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
