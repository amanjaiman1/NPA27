"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, Search, Palette, Command } from "lucide-react";
import { navGroups } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { useChronicle } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { daysBetween, toISODate } from "@/lib/utils";

export function Sidebar({
  collapsed,
  onToggleCollapse,
  onNavigate,
  onOpenPalette,
  onOpenAppearance,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate?: () => void;
  onOpenPalette: () => void;
  onOpenAppearance: () => void;
}) {
  const pathname = usePathname();
  const profile = useChronicle((s) => s.profile);
  const mounted = useMounted();

  const daysLeft = mounted
    ? daysBetween(toISODate(new Date()), profile.examDate)
    : null;
  const initials = profile.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

  return (
    <aside
      className={cn(
        // `sidebar-panel`, not `chrome-glass`: the glass treatment is scoped to
        // `lg` in globals.css so the mobile drawer stays flatly opaque. See the
        // rule there for why.
        "sidebar-panel flex h-full flex-col border-r border-line bg-card backdrop-blur-none lg:bg-card/60 lg:backdrop-blur-xl",
        "transition-[width] duration-300 ease-out",
        collapsed ? "w-[84px]" : "w-[274px]",
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 py-5">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-3 overflow-hidden"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-line bg-card shadow-soft">
            <Logo className="h-6 w-6" />
          </span>
          {!collapsed && (
            <div className="min-w-0 leading-tight animate-fade-in-fast">
              <p className="truncate font-display text-[1rem] font-bold tracking-tightest text-paper">
                OP NPA28
              </p>
              <p className="truncate text-[0.72rem] text-paper/40">
                Prep, documented
              </p>
            </div>
          )}
        </Link>
      </div>

      {/* Search trigger */}
      <div className="px-3">
        <button
          onClick={onOpenPalette}
          className={cn(
            "group flex w-full items-center gap-2.5 rounded-full border border-line bg-paper/[0.04] px-4 py-2.5 text-paper/50 transition-all hover:border-paper/25 hover:text-paper",
            collapsed && "justify-center px-0",
          )}
        >
          <Search className="h-4 w-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="text-sm">Search…</span>
              {/* Drawn, not typed: Poppins has no ⌘ glyph, and borrowing one
                  from a system font would smuggle in a third typeface. */}
              <kbd className="ml-auto inline-flex items-center gap-0.5 rounded-md bg-paper/[0.07] px-1.5 py-1 text-[0.6rem] font-semibold text-paper/45">
                <Command className="h-2.5 w-2.5" />K
              </kbd>
            </>
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="mask-fade-b no-scrollbar mt-5 flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-4 pb-2 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-paper/30">
                {group.label}
              </p>
            )}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-full px-3.5 py-2.5 text-sm transition-all duration-200",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-accent/[0.12] font-semibold text-accent"
                          : "font-medium text-paper/60 hover:bg-paper/[0.05] hover:text-paper",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-[1.1rem] w-[1.1rem] shrink-0 transition-transform duration-200",
                          active
                            ? "text-accent"
                            : "text-paper/40 group-hover:text-paper/80",
                        )}
                      />
                      {!collapsed && (
                        <span className="truncate tracking-snugg">
                          {item.label}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer: profile + controls */}
      <div className="border-t border-line p-3">
        <div
          className={cn(
            "flex items-center gap-3 rounded-2xl px-2 py-2",
            collapsed && "justify-center px-0",
          )}
        >
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-accent-fg shadow-accent">
            <span className="text-xs font-bold">{initials}</span>
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-paper">
                {profile.name}
              </p>
              <p className="truncate text-[0.72rem] text-paper/45">
                {daysLeft !== null
                  ? `${daysLeft} days to exam`
                  : profile.targetExam}
              </p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={onOpenAppearance}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-paper/45 transition-colors hover:bg-paper/[0.07] hover:text-paper"
              aria-label="Settings"
              title="Settings"
            >
              <Palette className="h-4 w-4" />
            </button>
          )}
        </div>

        <button
          onClick={onToggleCollapse}
          className={cn(
            "mt-1 hidden w-full items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium text-paper/40 transition-colors hover:bg-paper/[0.05] hover:text-paper/70 lg:flex",
            collapsed && "justify-center px-0",
          )}
        >
          <PanelLeftClose
            className={cn(
              "h-4 w-4 transition-transform",
              collapsed && "rotate-180",
            )}
          />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
