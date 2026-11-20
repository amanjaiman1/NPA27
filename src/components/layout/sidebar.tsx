"use client";

import { AppLink as Link } from "./app-link";
import { warmOverlays } from "./overlays";
import { usePathname } from "next/navigation";
import { CalendarClock, Command, Palette, PanelLeftClose, Search } from "lucide-react";
import { isActivePath, navGroups, type NavItem } from "@/lib/nav";
import { useVisibleNavGroups } from "@/components/features/feature-access";
import { cn, daysBetween, toISODate } from "@/lib/utils";
import { useChronicle } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { Avatar } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/button";
import { Logo } from "./logo";
import { Progress } from "@/components/ui/progress";

/**
 * Where the sidebar is showing:
 *   docked  beside the rail on a wide desktop, part of the layout
 *   flyout  opened from the rail over the page on a narrower desktop
 *   drawer  the phone's full-height menu, with the profile and appearance
 *           the rail carries on a desktop
 */
export type SidebarVariant = "docked" | "flyout" | "drawer";

function NavLink({ item, active, badge, onNavigate }: { item: NavItem; active: boolean; badge?: number; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-[0.55rem] text-[0.84rem] transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
        active
          ? "bg-[var(--nav-active)] font-semibold text-[color:var(--nav-active-fg)] shadow-[inset_0_0_0_1px_var(--nav-active-ring),0_8px_18px_-14px_rgb(var(--shadow)/0.55)]"
          : "font-medium text-paper/70 hover:bg-[var(--nav-hover)] hover:text-paper",
      )}
    >
      <Icon
        className={cn("h-[1.05rem] w-[1.05rem] shrink-0 transition-colors", active ? "text-accent" : "text-paper/55 group-hover:text-paper")}
        strokeWidth={active ? 2.1 : 1.85}
      />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {badge ? (
        <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[0.62rem] font-semibold leading-none text-accent-fg">
          {badge > 99 ? "99+" : badge}
          <span className="sr-only"> due</span>
        </span>
      ) : null}
    </Link>
  );
}

/**
 * The full navigation: every section of the app, grouped as in `lib/nav.ts`,
 * with the current page highlighted and a count where something is waiting.
 */
export function Sidebar({
  variant,
  onNavigate,
  onCollapse,
  onOpenPalette,
  onOpenAppearance,
}: {
  variant: SidebarVariant;
  onNavigate?: () => void;
  /** Docked only: hide the sidebar, leaving the rail. */
  onCollapse?: () => void;
  onOpenPalette: () => void;
  onOpenAppearance: () => void;
}) {
  const pathname = usePathname();
  const profile = useChronicle((s) => s.profile);
  const revisions = useChronicle((s) => s.revisions);
  const mounted = useMounted();
  const today = mounted ? toISODate(new Date()) : null;
  const daysLeft = today ? daysBetween(today, profile.examDate) : null;
  const journey = today ? daysBetween(profile.startDate, today) : 0;
  const elapsed =
    daysLeft !== null && journey + daysLeft > 0 ? Math.max(0, Math.min(100, (journey / (journey + Math.max(0, daysLeft))) * 100)) : 0;
  // A count only where something is actually waiting: revisions due today or earlier.
  const due = today ? revisions.filter((r) => r.nextDue <= today).length : 0;
  const drawer = variant === "drawer";
  const groups = useVisibleNavGroups(navGroups);

  return (
    <aside
      id="app-sidebar"
      aria-label="Navigation"
      className={cn(
        "flex h-full w-64 flex-col",
        variant === "drawer" && "drawer-surface w-[17.5rem]",
        variant === "docked" && "chrome-glass rounded-[1.75rem]",
        // Over the page, so firmer than the docked glass: nothing reads through.
        variant === "flyout" && "drawer-surface rounded-[1.75rem] border border-line shadow-lift",
      )}
    >
      {/* Brand. On a desktop the mark is on the rail, so only the wordmark. */}
      <div className="flex items-center gap-3 px-5 pb-3 pt-5">
        <Link href="/dashboard" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-3">
          {drawer && (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-line bg-card shadow-soft">
              <Logo className="h-6 w-6" />
            </span>
          )}
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-brand text-[1.05rem] font-bold tracking-[-0.03em] text-paper">DoOrDie</span>
            <span className="block truncate text-[0.7rem] text-paper/55">Prep, documented</span>
          </span>
        </Link>
        {variant === "docked" && onCollapse && (
          <IconButton label="Collapse sidebar" size="sm" onClick={onCollapse}>
            <PanelLeftClose className="h-4 w-4" />
          </IconButton>
        )}
      </div>

      {/* The rail has search on a desktop; the phone's menu brings its own. */}
      {drawer && (
        <div className="px-4 pb-2">
          <button
            type="button"
            onClick={onOpenPalette}
            onTouchStart={() => warmOverlays("palette")}
            onPointerEnter={() => warmOverlays("palette")}
            className="field flex w-full items-center gap-2.5 rounded-xl border border-line bg-paper/[0.03] px-3.5 py-2.5 text-sm text-paper/60 transition-colors hover:text-paper"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span>Search pages…</span>
            <kbd className="ml-auto hidden items-center gap-0.5 rounded-md bg-paper/[0.07] px-1.5 py-0.5 text-[0.6rem] font-semibold text-paper/55 sm:inline-flex">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </button>
        </div>
      )}

      <nav aria-label="Main" className="no-scrollbar mask-fade-b flex-1 space-y-5 overflow-y-auto px-3 pb-6 pt-2">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-[0.72rem] font-medium text-paper/55">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink
                    item={item}
                    active={isActivePath(pathname, item.href)}
                    badge={item.href === "/revision" ? due : undefined}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* The phone's menu carries the countdown and the profile, which the
          desktop shows in the top bar and on the rail. */}
      {drawer && (
      <div className="space-y-2 border-t border-line p-3">
        {daysLeft !== null && (
          <div className="inset-panel px-3.5 py-3">
            <div className="flex items-center gap-2 text-[0.72rem] text-paper/65">
              <CalendarClock className="h-3.5 w-3.5 text-accent" />
              <span className="truncate">
                <span className="tabular font-semibold text-paper">{Math.max(0, daysLeft)}</span> days to{" "}
                {profile.targetExam.replace("UPSC ", "")}
              </span>
            </div>
            <Progress value={elapsed} className="mt-2 h-1" label="How much of your preparation time has passed" />
          </div>
        )}
        <div className="flex items-center gap-2 px-1 pt-1">
          <Link
            href="/settings#profile"
            onClick={onNavigate}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-1 transition-opacity hover:opacity-85"
          >
            <Avatar name={profile.name || "You"} size="md" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-paper">{profile.name || "Your profile"}</span>
              <span className="block truncate text-[0.7rem] text-paper/55">Profile and exam</span>
            </span>
          </Link>
          <IconButton label="Appearance" onClick={onOpenAppearance} onTouchStart={() => warmOverlays("appearance")} onPointerEnter={() => warmOverlays("appearance")}>
            <Palette className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
      )}
    </aside>
  );
}
