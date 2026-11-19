# Feature access

Every DoOrDie feature is free and open to every account. There are no plans,
prices, trials, limits or locked features, and nothing in the app checks a
payment. This document describes the small layer that makes that a single,
replaceable decision, so that if the product ever needed per-account access
(a school's own deployment, a feature in early testing), one module would
change and the pages wouldn't.

## The pieces

`src/lib/features.ts`

- `FEATURES`: every product feature, keyed (`journal`, `revision`, `mocks`,
  `diary`, …), with its label and the app routes it owns. `FeatureKey` is
  the union of the keys.
- `AccessSubject`: who is asking. Only `{ accountId }`. Deliberately no
  role, profile field or anything the client could claim.
- `FeatureAccessProvider`: `{ id, resolve(subject) → FeatureAccess }`, where
  `FeatureAccess` is `{ has(feature), source }`.
- `everyoneProvider`: the only provider. `has()` is always true.
- `resolveFeatureAccess(subject)` and `canAccessFeature(access, key)`: what
  the app calls. `featureForPath(pathname)` maps a page to its feature.

`src/components/features/feature-access.tsx`

- `FeatureAccessScope` resolves access once per account, inside the app
  shell.
- `FeatureGate` wraps every app page. If a provider said no, the page
  wouldn't mount and a plain note would say the feature isn't available on
  the account. No price, no upgrade button.
- `useVisibleNav`, `useVisibleNavGroups` and `allowedNav` filter the sidebar,
  the phone's bottom bar and the command palette the same way.

With `everyoneProvider` none of this is visible: every check passes.

## Roles are not entitlements

Admin Center roles (`src/lib/platform/roles.ts`) and feature access never
meet. A provider never receives a role, so being an Admin grants no product
feature, and no product feature can ever open the Admin Center. The Admin
Center checks its own permissions on the server for every request.

## Adding a provider later

1. Write a provider that answers from something the server controls, for
   example a table of per-account grants read with the user's own session
   and protected by row-level security:

   ```ts
   export const grantsProvider = (grants: Set<FeatureKey>): FeatureAccessProvider => ({
     id: "grants",
     resolve: () => ({ has: (f) => grants.has(f), source: "grants" }),
   });
   ```

2. Load what it needs before `FeatureAccessScope` renders, and resolve with
   it there instead of `resolveFeatureAccess`.
3. Enforce the same decision where the data lives. The gate and the
   navigation only decide what to show; a row-level security policy (or the
   database function the feature calls) must refuse what isn't allowed.
4. Keep `everyoneProvider` as the default so local-only mode and tests keep
   working, and add the new provider's cases to `tests/feature-access.test.ts`.

Until then, there is nothing to configure.
