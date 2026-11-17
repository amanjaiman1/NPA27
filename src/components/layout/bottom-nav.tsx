"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { essentialNavItems, isActivePath } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * On a phone, the four everyday sections sit one tap away at the bottom of the
 * screen, where a thumb reaches; "More" opens the full menu. It is the same
 * navigation as the sidebar's Essentials, just placed for a small screen, and
 * it disappears on wide screens where the sidebar is always visible.
 *
 * It publishes its height as `--bottom-nav-h` so floating notices and the page
 * itself can keep clear of it.
 */
export function BottomNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () =>
      root.style.setProperty("--bottom-nav-h", mq.matches ? "0px" : "calc(4rem + env(safe-area-inset-bottom))");
    apply();
    mq.addEventListener?.("change", apply);
    return () => {
      mq.removeEventListener?.("change", apply);
      root.style.removeProperty("--bottom-nav-h");
    };
  }, []);

  return (
    <nav
      aria-label="Quick access"
      className="chrome-glass fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-xl grid-cols-5">
        {essentialNavItems.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-full flex-col items-center justify-center gap-1 text-[0.66rem] font-semibold transition-colors",
                  active ? "text-accent" : "text-paper/60 hover:text-paper",
                )}
              >
                {active && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-accent" aria-hidden />}
                <Icon className="h-5 w-5" />
                {item.tab ?? item.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onOpenMenu}
            className="flex h-full w-full flex-col items-center justify-center gap-1 text-[0.66rem] font-semibold text-paper/60 transition-colors hover:text-paper"
          >
            <Menu className="h-5 w-5" />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}
