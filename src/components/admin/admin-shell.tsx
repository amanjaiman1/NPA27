"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Menu, ShieldCheck, ShieldOff, X } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { ADMIN_NAV, activeAdminItem } from "@/lib/platform/nav";
import { ROLE_LABEL } from "@/lib/platform/roles";
import { cn } from "@/lib/utils";
import { useAdminActor } from "./admin-context";

function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? "/admin";
  const { can } = useAdminActor();
  const active = activeAdminItem(pathname);
  return (
    <nav aria-label="Admin Center" className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 no-scrollbar">
      {ADMIN_NAV.map((group) => {
        const items = group.items.filter((i) => can(i.permission));
        if (!items.length) return null;
        return (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-[0.72rem] font-medium text-paper/55">{group.label}</p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const on = active?.href === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl px-3 py-[0.55rem] text-[0.84rem] transition-all duration-200",
                        on
                          ? "bg-[var(--nav-active)] font-semibold text-[color:var(--nav-active-fg)] shadow-[inset_0_0_0_1px_var(--nav-active-ring),0_8px_18px_-14px_rgb(var(--shadow)/0.55)]"
                          : "font-medium text-paper/70 hover:bg-[var(--nav-hover)] hover:text-paper",
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", on ? "text-accent" : "text-paper/55")} strokeWidth={on ? 2.1 : 1.85} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-5 pb-4 pt-5">
      <span className="grid h-10 w-10 place-items-center rounded-2xl border border-line bg-card shadow-soft">
        <Logo className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <p className="font-brand text-[1.05rem] font-semibold leading-tight text-paper">DoOrDie</p>
        <p className="flex items-center gap-1 text-[0.7rem] font-semibold text-accent">
          <ShieldCheck className="h-3 w-3" aria-hidden /> Admin Center
        </p>
      </div>
    </div>
  );
}

function Identity() {
  const { actor } = useAdminActor();
  return (
    <div className="border-t border-line p-3">
      <div className="flex items-center gap-3 rounded-2xl bg-paper/[0.03] px-3 py-2.5">
        <Avatar name={actor.email ?? "Admin"} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.8rem] font-medium text-paper">{actor.email}</p>
          <p className="text-[0.7rem] text-paper/55">{ROLE_LABEL[actor.role]}</p>
        </div>
      </div>
      <Link
        href="/dashboard"
        className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-[0.8rem] font-medium text-paper/65 transition-colors hover:bg-[var(--nav-hover)] hover:text-paper"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to the app
      </Link>
    </div>
  );
}

/**
 * The Admin Center's own frame: its navigation, filtered to the role, and a
 * stage like the app's. On a phone the navigation is a drawer.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname() ?? "/admin";
  const current = activeAdminItem(pathname);
  const { actor, can } = useAdminActor();
  // A page outside the role isn't mounted, so it doesn't ask for data the API would refuse.
  const outside = current && !can(current.permission);

  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  return (
    <div className="app-root relative flex h-[100dvh] overflow-hidden" data-admin-center>
      <div aria-hidden className="app-backdrop pointer-events-none fixed inset-0 -z-10" />

      <div className="hidden shrink-0 py-3 pl-3 lg:flex">
        <aside className="chrome-glass flex h-full w-64 flex-col rounded-[1.75rem]">
          <Brand />
          <AdminNav />
          <Identity />
        </aside>
      </div>

      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-scrim/50 backdrop-blur-[2px] lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              role="dialog"
              aria-label="Admin Center menu"
              className="drawer-surface fixed inset-y-0 left-0 z-50 flex w-[17.5rem] flex-col lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 320 }}
            >
              <div className="flex items-center justify-between pr-3">
                <Brand />
                <button
                  type="button"
                  onClick={() => setDrawer(false)}
                  aria-label="Close menu"
                  className="lg-clear grid h-9 w-9 place-items-center rounded-full text-paper/60 hover:text-paper"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <AdminNav onNavigate={() => setDrawer(false)} />
              <Identity />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col gap-3 lg:py-3 lg:pl-3 lg:pr-3">
        <header className="z-30 shrink-0 px-3 pt-3 lg:hidden">
          <div className="chrome-glass flex h-14 items-center gap-2 rounded-[1.25rem] px-2">
            <button
              type="button"
              onClick={() => setDrawer(true)}
              aria-label="Open the Admin Center menu"
              className="lg-clear grid h-10 w-10 place-items-center rounded-full text-paper/70 hover:text-paper"
            >
              <Menu className="h-[1.15rem] w-[1.15rem]" />
            </button>
            <Logo className="h-6 w-6" />
            <span className="min-w-0 truncate text-sm font-semibold text-paper">{current?.label ?? "Admin Center"}</span>
            <span className="ml-auto mr-1 rounded-full bg-accent/[0.12] px-2.5 py-1 text-[0.68rem] font-semibold text-accent">Admin</span>
          </div>
        </header>
        <main className="app-stage no-scrollbar relative min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-4 sm:px-6 lg:px-8 lg:pt-8 2xl:px-10">
            {outside ? (
              <Card className="mx-auto mt-6 max-w-lg p-6 text-center sm:p-8">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-paper/[0.05] text-paper/60">
                  <ShieldOff className="h-5 w-5" aria-hidden />
                </span>
                <h1 className="mt-4 text-lg font-semibold tracking-snugg text-paper">{current.label} isn&apos;t part of your role</h1>
                <p className="mt-1.5 text-sm leading-relaxed text-paper/65">
                  The {ROLE_LABEL[actor.role]} role doesn&apos;t include this page. A Super Admin can change roles in Admin access.
                </p>
                <Link href="/admin" className="mt-5 inline-flex text-sm font-semibold text-accent hover:underline">
                  Back to the overview
                </Link>
              </Card>
            ) : (
              children
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
