"use client";

import { forwardRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Eye, EyeOff, Info, Loader2, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { FullScreen } from "@/components/account/boot-screen";
import { BootRing } from "@/components/ui/loading";
import { cn } from "@/lib/utils";

/** The brand, a card, and an optional footer — every auth screen's frame. */
export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <FullScreen>
      <div className="w-full max-w-[26rem]">
        <Link href="/" className="mb-7 flex flex-col items-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-[1.25rem] border border-line bg-card shadow-soft">
            <Logo className="h-8 w-8" />
          </span>
          <span className="mt-4 font-brand text-[1.6rem] font-bold tracking-[-0.04em] text-paper">DoOrDie</span>
          <span className="mt-0.5 text-xs text-paper/60">Your UPSC preparation, documented</span>
        </Link>
        {children}
      </div>
    </FullScreen>
  );
}

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <>
      <div className="rounded-[1.75rem] border border-line bg-card p-6 shadow-lift sm:p-8">
        <h1 className="text-[1.35rem] font-semibold tracking-[-0.03em] text-paper">{title}</h1>
        {subtitle && <p className="mt-1 text-sm leading-relaxed text-paper/60">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-5 text-center text-sm text-paper/55">{footer}</div>}
    </>
  );
}

export function AuthMessage({
  tone,
  children,
  className,
}: {
  tone: "error" | "info" | "success";
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "error" ? AlertTriangle : tone === "success" ? CheckCircle2 : Info;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-2.5 rounded-xl border px-3.5 py-2.5 text-[0.8rem] leading-relaxed",
        tone === "error" && "border-danger/30 bg-danger/10 text-paper/85",
        tone === "info" && "border-line bg-paper/[0.04] text-paper/70",
        tone === "success" && "border-positive/30 bg-positive/10 text-paper/85",
        className,
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          tone === "error" ? "text-danger" : tone === "success" ? "text-positive" : "text-accent",
        )}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A labelled field with an optional inline error, wired for screen readers. */
export function AuthField({
  id,
  label,
  error,
  hint,
  aside,
  children,
}: {
  id: string;
  label: string;
  error?: string | null;
  hint?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[0.78rem] font-semibold tracking-snugg text-paper/60">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[0.72rem] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[0.72rem] text-paper/40">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A password input with a show/hide toggle. */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function PasswordInput({ className, ...props }, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        ref={ref}
        type={visible ? "text" : "password"}
        className={cn("pr-11", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-paper/45 transition-colors hover:bg-paper/[0.06] hover:text-paper"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
});

export function SubmitButton({
  busy,
  children,
  className,
}: {
  busy: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Button type="submit" size="lg" disabled={busy} className={cn("w-full", className)}>
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}

/** A wait inside the auth frame (the frame already fills the screen). */
export function AuthPending({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-line bg-card px-6 py-10 text-center shadow-lift">
      <BootRing className="h-14 w-14" />
      <span className="text-sm text-paper/55" aria-live="polite">
        {label}
      </span>
    </div>
  );
}

/** A `next` path that stays on this site, or the dashboard. Blocks open redirects. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/dashboard";
  // The home page is the public site; after signing in, "home" means the app.
  if (raw === "/") return "/dashboard";
  return raw;
}

/** Reads a query parameter on the client without a Suspense boundary. */
export function queryParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}
