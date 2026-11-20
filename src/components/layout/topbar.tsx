"use client";

import { AppLink as Link } from "./app-link";
import { warmOverlays } from "./overlays";
import { CalendarClock, Command, Menu, Plus, Search } from "lucide-react";
import { Logo } from "./logo";
import { AccountMenu } from "@/components/account/account-menu";
import { useAccount } from "@/components/account/account-session";
import { NotificationCentre } from "@/components/notifications/centre";
import { Notifier } from "@/components/notifications/notifier";
import { TourButton } from "@/components/tour/tour-button";
import { IconButton } from "@/components/ui/button";
import { useChronicle } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { daysBetween, toISODate } from "@/lib/utils";

/**
 * The floating bar above the page. On a desktop it is mostly search: a wide
 * field that opens the command palette (⌘K / Ctrl+K), then the exam countdown
 * and the one loud action, logging today. The account and notifications live
 * on the rail there. On a phone the bar carries the menu, the brand, and
 * those two as well. The feature tour's button is here on every page: a
 * labelled pill on a desktop, a compass on a phone.
 */
export function Topbar({
  onOpenDrawer,
  onOpenPalette,
  desktop,
}: {
  onOpenDrawer: () => void;
  onOpenPalette: () => void;
  /** The rail is showing, with the account and notifications on it. */
  desktop: boolean;
}) {
  const profile = useChronicle((s) => s.profile);
  const { mode } = useAccount();
  const mounted = useMounted();
  const daysLeft = mounted ? daysBetween(toISODate(new Date()), profile.examDate) : null;

  return (
    <header className="z-30 shrink-0 px-3 pt-3 lg:px-0 lg:pt-0">
      <div className="chrome-glass flex h-14 items-center gap-1.5 rounded-[1.25rem] px-2 sm:gap-2 lg:h-[3.75rem] lg:rounded-[1.4rem] lg:px-2.5">
        {!desktop && (
          <>
            <IconButton label="Open menu" onClick={onOpenDrawer}>
              <Menu className="h-5 w-5" />
            </IconButton>
            <Link href="/dashboard" aria-label="DoOrDie — dashboard" className="flex items-center gap-2 px-1">
              <Logo className="h-6 w-6" />
              <span className="hidden font-brand text-[0.95rem] font-bold tracking-[-0.03em] text-paper min-[400px]:inline">DoOrDie</span>
            </Link>
          </>
        )}

        {/* Search: a wide field on a desktop, an icon on a phone. Both open
            the command palette, which jumps to any page. */}
        {desktop ? (
          <button
            type="button"
            onClick={onOpenPalette}
            onPointerEnter={() => warmOverlays("palette")}
            onFocus={() => warmOverlays("palette")}
            aria-keyshortcuts="Control+K Meta+K"
            className="group flex h-11 min-w-0 max-w-[44rem] flex-1 items-center gap-3 rounded-[1rem] px-3.5 text-left text-paper/60 transition-colors hover:bg-[var(--nav-hover)] hover:text-paper"
          >
            <Search className="h-[1.1rem] w-[1.1rem] shrink-0" />
            <span className="min-w-0 flex-1 truncate text-[0.9rem]">Search pages…</span>
            {/* Drawn, not typed: Poppins has no ⌘ glyph. */}
            <kbd className="hidden shrink-0 items-center gap-0.5 rounded-lg border border-line bg-card px-2 py-1 text-[0.62rem] font-semibold text-paper/60 shadow-soft sm:inline-flex">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </button>
        ) : (
          <div className="flex-1" />
        )}

        {desktop && <div className="flex-1" />}

        {daysLeft !== null && (
          <div className="hidden shrink-0 items-center gap-2 rounded-full border border-line bg-card px-3.5 py-2 shadow-soft md:flex">
            <CalendarClock className="h-3.5 w-3.5 text-accent" />
            <span className="tabular whitespace-nowrap text-xs text-paper/65">
              <span className="font-semibold text-paper">{Math.max(0, daysLeft)}</span> days to{" "}
              {profile.targetExam.replace("UPSC ", "")}
            </span>
          </div>
        )}

        {desktop && <TourButton variant="pill" />}

        {!desktop && (
          <>
            <IconButton label="Search" onClick={onOpenPalette} onTouchStart={() => warmOverlays("palette")}>
              <Search className="h-5 w-5" />
            </IconButton>
            <TourButton variant="icon" />
            <NotificationCentre />
            <AccountMenu />
          </>
        )}

        {/* Mounted once, inside the authenticated shell, where notification
            delivery belongs. It renders nothing. Not in the demo: the sample
            account's reminders must never reach the device. */}
        {mode !== "demo" && <Notifier />}

        <Link
          href="/journal?new=1"
          className="hidden shrink-0 items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold tracking-snugg text-accent-fg shadow-accent transition-all duration-200 hover:-translate-y-px hover:brightness-[1.06] active:translate-y-0 sm:inline-flex"
        >
          <Plus className="h-4 w-4" />
          Log today
        </Link>
      </div>
    </header>
  );
}
