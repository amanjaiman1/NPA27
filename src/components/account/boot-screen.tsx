"use client";

import { BootRing } from "@/components/ui/loading";
import { Logo } from "@/components/layout/logo";
import { cn } from "@/lib/utils";

/** The backdrop every full-screen state sits on, matching the app shell. */
export function FullScreen({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative grid min-h-[100dvh] place-items-center overflow-hidden px-5 py-10",
        className,
      )}
    >
      <div aria-hidden className="app-backdrop pointer-events-none fixed inset-0 -z-10" />
      {children}
    </div>
  );
}

/** A wait with nothing to show yet: auth resolving, an account loading. */
export function BootScreen({ label }: { label?: string }) {
  return (
    <FullScreen>
      <div className="flex flex-col items-center gap-5 text-center">
        <BootRing className="h-[5.25rem] w-[5.25rem]" />
        {label && (
          <span className="text-sm text-paper/55" aria-live="polite">
            {label}
          </span>
        )}
      </div>
    </FullScreen>
  );
}

/** A blocking state that needs the student's attention, with a way forward. */
export function StatusScreen({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon?: React.ElementType;
  title: string;
  body?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <FullScreen>
      <div className="w-full max-w-md rounded-3xl border border-line bg-card p-7 text-center shadow-lift">
        {Icon ? (
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent/[0.12] text-accent">
            <Icon className="h-5 w-5" />
          </span>
        ) : (
          <Logo className="mx-auto h-9 w-9" />
        )}
        <h1 className="mt-4 font-display text-xl font-bold tracking-tightest text-paper">{title}</h1>
        {body && <div className="mt-2 text-sm leading-relaxed text-paper/60">{body}</div>}
        {children && <div className="mt-6 flex flex-col gap-2.5">{children}</div>}
      </div>
    </FullScreen>
  );
}
