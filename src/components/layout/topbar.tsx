"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, Plus, Palette, CalendarClock } from "lucide-react";
import { findNavItem } from "@/lib/nav";
import { Logo } from "./logo";
import { SyncStatus } from "./sync-status";
import { useChronicle } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { daysBetween, toISODate } from "@/lib/utils";

/** Round icon button used across the floating bar. */
function IconButton({
  label,
  onClick,
  children,
  className = "",
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-10 w-10 place-items-center rounded-full text-paper/55 transition-all hover:bg-paper/[0.07] hover:text-paper ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * A floating pill bar rather than a full-width chrome edge — it lets the canvas
 * breathe underneath and keeps the app feeling light.
 */
export function Topbar({
  onOpenDrawer,
  onOpenPalette,
  onOpenAppearance,
}: {
  onOpenDrawer: () => void;
  onOpenPalette: () => void;
  onOpenAppearance: () => void;
}) {
  const pathname = usePathname();
  const current = findNavItem(pathname);
  const profile = useChronicle((s) => s.profile);
  const mounted = useMounted();
  const daysLeft = mounted
    ? daysBetween(toISODate(new Date()), profile.examDate)
    : null;

  return (
    <header className="sticky top-0 z-30 px-3 pb-1 pt-3 sm:px-5 sm:pt-4">
      <div className="chrome-glass flex h-14 items-center gap-2 rounded-full border border-line bg-card/95 px-2.5 shadow-soft backdrop-blur-none sm:bg-card/80 sm:px-3 sm:backdrop-blur-xl">
        {/* Mobile: menu + brand */}
        <IconButton label="Open menu" onClick={onOpenDrawer} className="lg:hidden">
          <Menu className="h-5 w-5" />
        </IconButton>
        <Link
          href="/"
          aria-label="The UPSC Chronicle — home"
          className="flex items-center gap-2 pl-1 lg:hidden"
        >
          <Logo className="h-6 w-6" />
        </Link>

        {/* Desktop: current section */}
        <div className="hidden items-center gap-2.5 pl-2.5 lg:flex">
          {current?.icon && <current.icon className="h-4 w-4 text-accent" />}
          <span className="font-display text-sm font-semibold tracking-snugg text-paper">
            {current?.label ?? "The UPSC Chronicle"}
          </span>
        </div>

        <div className="flex-1" />

        {/* Exam countdown */}
        {daysLeft !== null && (
          <div className="hidden items-center gap-2 rounded-full bg-paper/[0.05] px-3.5 py-2 sm:flex">
            <CalendarClock className="h-3.5 w-3.5 text-accent" />
            <span className="tabular text-xs text-paper/65">
              <span className="font-semibold text-paper">{daysLeft}</span> days to{" "}
              {profile.targetExam.replace("UPSC ", "")}
            </span>
          </div>
        )}

        <IconButton label="Search" onClick={onOpenPalette} className="sm:hidden">
          <Search className="h-5 w-5" />
        </IconButton>

        <IconButton
          label="Settings"
          onClick={onOpenAppearance}
          className="lg:hidden"
        >
          <Palette className="h-5 w-5" />
        </IconButton>

        <SyncStatus />

        {/* The one loud thing in the bar */}
        <Link
          href="/journal?new=1"
          className="hidden items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold tracking-snugg text-accent-fg shadow-accent transition-all hover:-translate-y-px hover:brightness-[1.08] sm:flex"
        >
          <Plus className="h-4 w-4" />
          Log today
        </Link>
      </div>
    </header>
  );
}
