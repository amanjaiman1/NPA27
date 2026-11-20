"use client";

import { useEffect } from "react";
import { AppLink as Link } from "./app-link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { essentialNavItems, isActivePath } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useVisibleNav } from "@/components/features/feature-access";

/**
 * On a phone, the four everyday sections sit one tap away in a floating dock
 * at the bottom of the screen, where a thumb reaches; "More" opens the full
 * menu. It is the same navigation as the sidebar's Essentials, placed for a
 * small screen, and it disappears on wide screens where the rail shows.
 *
 * It publishes the space it takes as `--bottom-nav-h` so floating notices and
 * the page itself can keep clear of it.
 */
export function BottomNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();
  const items = useVisibleNav(essentialNavItems);

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () =>
      root.style.setProperty(
        "--bottom-nav-h",
        mq.matches ? "0px" : "calc(4.25rem + max(0.625rem, env(safe-area-inset-bottom)))",
      );
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
      className="fixed inset-x-3 bottom-[max(0.625rem,env(safe-area-inset-bottom))] z-30 lg:hidden"
    >
      <ul
        className="chrome-glass mx-auto grid h-[3.75rem] max-w-md grid-cols-5 rounded-[1.4rem] px-1"
        // Five columns: the four everyday pages and "More". Fewer if an account can't open one of them.
        style={items.length === 4 ? undefined : { gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="p-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 rounded-2xl text-[0.64rem] font-semibold transition-colors",
                  active ? "bg-[var(--nav-active)] text-accent" : "text-paper/60 hover:text-paper",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.1 : 1.85} />
                {item.tab ?? item.label}
              </Link>
            </li>
          );
        })}
        <li className="p-1">
          <button
            type="button"
            onClick={onOpenMenu}
            className="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-2xl text-[0.64rem] font-semibold text-paper/60 transition-colors hover:text-paper"
          >
            <Menu className="h-5 w-5" />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}
