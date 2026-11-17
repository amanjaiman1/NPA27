"use client";

import { BootRing } from "@/components/ui/loading";
import { Logo } from "@/components/layout/logo";
import { cn } from "@/lib/utils";

/** The aura canvas every full-screen state sits on, matching the app shell. */
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
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-aura" />
        <div className="absolute -left-24 top-[-6rem] hidden h-80 w-80 animate-bloom-float rounded-full bg-[rgb(var(--aura-1)/0.16)] blur-[90px] sm:block" />
        <div className="absolute bottom-10 right-[-5rem] hidden h-72 w-72 animate-bloom-float-2 rounded-full bg-[rgb(var(--aura-2)/0.14)] blur-[90px] sm:block" />
      </div>
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
