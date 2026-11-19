"use client";

import { createContext, useContext, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  FEATURES,
  canAccessFeature,
  everyoneProvider,
  featureForPath,
  resolveFeatureAccess,
  type FeatureAccess,
  type FeatureKey,
} from "@/lib/features";

/* The app's side of lib/features.ts: the account's access, worked out once
   and shared with the shell and the navigation. With the only provider there
   is today, every feature is open to every account and none of this shows. */

const AccessContext = createContext<FeatureAccess>(everyoneProvider.resolve({ accountId: null }));

export function FeatureAccessScope({ accountId, children }: { accountId: string | null; children: React.ReactNode }) {
  const access = useMemo(() => resolveFeatureAccess({ accountId }), [accountId]);
  return <AccessContext.Provider value={access}>{children}</AccessContext.Provider>;
}

export const useFeatureAccess = () => useContext(AccessContext);

/** Navigation entries whose page the account may open. Pages outside every feature always stay. */
export function allowedNav<T extends { href: string }>(items: readonly T[], access: FeatureAccess): T[] {
  return items.filter((i) => {
    const feature = featureForPath(i.href);
    return !feature || canAccessFeature(access, feature);
  });
}

export function useVisibleNav<T extends { href: string }>(items: readonly T[]): T[] {
  const access = useFeatureAccess();
  return useMemo(() => allowedNav(items, access), [items, access]);
}

/** The sidebar's groups, each with only what the account may open; empty groups go. */
export function useVisibleNavGroups<G extends { items: { href: string }[] }>(groups: readonly G[]): G[] {
  const access = useFeatureAccess();
  return useMemo(
    () => groups.map((g) => ({ ...g, items: allowedNav(g.items, access) })).filter((g) => g.items.length > 0),
    [groups, access],
  );
}

/**
 * Wraps every app page. If a provider ever says no, the page isn't mounted
 * and a plain note says so: no prices, no upgrade prompt. Today it always
 * says yes.
 */
export function FeatureGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const access = useFeatureAccess();
  const feature: FeatureKey | null = featureForPath(pathname);
  if (!feature || canAccessFeature(access, feature)) return <>{children}</>;
  return (
    <Card className="mx-auto mt-8 max-w-lg p-6 text-center sm:p-8">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-paper/[0.05] text-paper/60">
        <Compass className="h-5 w-5" aria-hidden />
      </span>
      <h1 className="mt-4 text-lg font-semibold tracking-snugg text-paper">{FEATURES[feature].label} isn&apos;t available on this account</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-paper/65">Everything you&apos;ve recorded is safe, and the rest of DoOrDie works as usual.</p>
      <Link href="/dashboard" className="mt-5 inline-flex text-sm font-semibold text-accent hover:underline">
        Go to the Command Center
      </Link>
    </Card>
  );
}
