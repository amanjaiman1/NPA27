"use client";

import { AppLink as Link } from "./app-link";
import { warmOverlays } from "./overlays";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  HeartPulse,
  LayoutDashboard,
  NotebookPen,
  Palette,
  Repeat,
  Route,
  Search,
  Settings,
  Target,
  type LucideIcon,
} from "lucide-react";
import { isActivePath } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/button";
import { AccountMenu } from "@/components/account/account-menu";
import { NotificationCentre } from "@/components/notifications/centre";
import { Logo } from "./logo";

/** The everyday destinations, one tap away whatever the sidebar is doing. */
const SHORTCUTS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Command Center", icon: LayoutDashboard },
  { href: "/journal", label: "Daily Journal", icon: NotebookPen },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/wellbeing", label: "Life Dashboard", icon: HeartPulse },
  { href: "/revision", label: "Revision", icon: Repeat },
  { href: "/roadmap", label: "Roadmap", icon: Route },
];

function RailLink({
  href,
  label,
  icon: Icon,
  active,
  utility = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  /** Drawn as a glass button, like the utilities beside it, rather than a nav item. */
  utility?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative grid h-11 w-11 place-items-center rounded-2xl transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
        utility
          ? cn("lg-clear", active ? "text-accent" : "text-paper/65 hover:text-paper")
          : active
            ? "bg-[var(--nav-active)] text-accent shadow-[inset_0_0_0_1px_var(--nav-active-ring),0_6px_16px_-10px_rgb(var(--shadow)/0.45)]"
            : "text-paper/60 hover:bg-[var(--nav-hover)] hover:text-paper",
      )}
    >
      <Icon className="h-[1.15rem] w-[1.15rem]" strokeWidth={active ? 2.1 : 1.85} />
    </Link>
  );
}

/**
 * The slim rail at the far left on a desktop: the brand, the account, the
 * everyday shortcuts, and the utilities (search, notifications, appearance,
 * settings). It stays put while the sidebar beside it opens and closes.
 */
export function NavRail({
  sidebarOpen,
  onToggleSidebar,
  onOpenPalette,
  onOpenAppearance,
}: {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenPalette: () => void;
  onOpenAppearance: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Shortcuts"
      className="chrome-glass relative flex h-full w-[4.75rem] shrink-0 flex-col items-center rounded-[1.75rem] py-4"
    >
      <Link
        href="/dashboard"
        aria-label="DoOrDie — Command Center"
        title="DoOrDie"
        className="grid h-11 w-11 place-items-center rounded-2xl border border-line bg-card shadow-soft transition-transform duration-200 hover:-translate-y-px"
      >
        <Logo className="h-6 w-6" />
      </Link>

      <div className="relative mt-4">
        <AccountMenu placement="rail" />
        {/* The sidebar's handle, on the rail's edge beside the avatar. */}
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? "Hide navigation" : "Show navigation"}
          aria-expanded={sidebarOpen}
          aria-controls="app-sidebar"
          title={sidebarOpen ? "Hide navigation" : "Show navigation"}
          className="chrome-glass absolute -right-[1.625rem] top-1/2 z-10 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-paper/65 transition-colors hover:text-paper"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-300", sidebarOpen && "rotate-180")} />
        </button>
      </div>

      <p className="mt-6 text-[0.7rem] font-medium text-paper/55">Main</p>
      <ul className="mt-2 flex flex-col items-center gap-1.5">
        {SHORTCUTS.map((s) => (
          <li key={s.href}>
            <RailLink {...s} active={isActivePath(pathname, s.href)} />
          </li>
        ))}
      </ul>

      <div className="flex-1" />

      <div className="flex flex-col items-center gap-1.5 border-t border-line pt-3">
        <IconButton label="Search (Ctrl K)" size="lg" onClick={onOpenPalette} onPointerEnter={() => warmOverlays("palette")} onFocus={() => warmOverlays("palette")} className="rounded-2xl">
          <Search className="h-[1.1rem] w-[1.1rem]" />
        </IconButton>
        <NotificationCentre placement="rail" className="h-11 w-11 rounded-2xl" />
        <IconButton label="Appearance" size="lg" onClick={onOpenAppearance} onPointerEnter={() => warmOverlays("appearance")} onFocus={() => warmOverlays("appearance")} className="rounded-2xl">
          <Palette className="h-[1.1rem] w-[1.1rem]" />
        </IconButton>
        <RailLink href="/settings" label="Settings" icon={Settings} active={isActivePath(pathname, "/settings")} utility />
      </div>
    </nav>
  );
}
