/* ════════════════════════════════════════════════════════════════
   FEATURE ACCESS
   Every product feature has a key, and every check for whether an account
   may use one goes through a provider. Today there is one provider and it
   grants every feature to every signed-in account: DoOrDie has no plans,
   prices or locks, and none of this changes what anyone can do.

   It exists so that, if entitlements ever arrive, one provider is replaced
   and the modules don't change: the app shell and the navigation already
   ask it. docs/feature-access.md describes how.

   A provider is told which account is asking and nothing more. It never
   receives a platform role (lib/platform/roles.ts), so administering the
   platform grants no product feature, and a product feature can never
   grant administration.
   ════════════════════════════════════════════════════════════════ */

export const FEATURES = {
  journal: { label: "Daily Journal", routes: ["/journal"] },
  goals: { label: "Goals", routes: ["/goals"] },
  life: { label: "Life Dashboard", routes: ["/wellbeing"] },
  revision: { label: "Revision", routes: ["/revision"] },
  dashboard: { label: "Command Center", routes: ["/dashboard"] },
  roadmap: { label: "Roadmap", routes: ["/roadmap"] },
  habits: { label: "My Habits", routes: ["/habits"] },
  coach: { label: "Study Coach", routes: ["/coach"] },
  currentAffairs: { label: "Current Affairs", routes: ["/current-affairs"] },
  mistakes: { label: "Mistake Tracker", routes: ["/mistakes"] },
  library: { label: "Library", routes: ["/books"] },
  heatmap: { label: "Study Heatmap", routes: ["/heatmap"] },
  subjects: { label: "Subject Progress", routes: ["/subjects"] },
  mocks: { label: "Mock Analytics", routes: ["/mocks"] },
  knowledgeGraph: { label: "Knowledge Graph", routes: ["/knowledge-graph"] },
  performanceReview: { label: "Performance Review", routes: ["/reviews"] },
  diary: { label: "Personal Diary", routes: ["/diary"] },
  announcements: { label: "Announcements", routes: ["/announcements"] },
  settings: { label: "Settings", routes: ["/settings"] },
} as const satisfies Record<string, { label: string; routes: readonly string[] }>;

export type FeatureKey = keyof typeof FEATURES;
export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

/** Who is asking. Deliberately no role, profile or plan: only the account. */
export interface AccessSubject {
  readonly accountId: string | null;
}

export interface FeatureAccess {
  /** Whether this account may use the feature. */
  readonly has: (feature: FeatureKey) => boolean;
  /** Which provider decided, for logs and tests. */
  readonly source: string;
}

export interface FeatureAccessProvider {
  readonly id: string;
  resolve(subject: AccessSubject): FeatureAccess;
}

/** The only provider: everything, for everyone. */
export const everyoneProvider: FeatureAccessProvider = {
  id: "everyone",
  resolve: () => ({ has: () => true, source: "everyone" }),
};

let provider: FeatureAccessProvider = everyoneProvider;

/** Tests only: try another provider. The app never calls this. */
export function setFeatureAccessProvider(next: FeatureAccessProvider | null): void {
  provider = next ?? everyoneProvider;
}

export function resolveFeatureAccess(subject: AccessSubject): FeatureAccess {
  return provider.resolve(subject);
}

export function canAccessFeature(access: FeatureAccess, feature: FeatureKey): boolean {
  return access.has(feature);
}

/** The feature a page belongs to, or null for pages that belong to none. */
export function featureForPath(pathname: string): FeatureKey | null {
  for (const key of FEATURE_KEYS) {
    if (FEATURES[key].routes.some((r) => pathname === r || pathname.startsWith(`${r}/`))) return key;
  }
  return null;
}
