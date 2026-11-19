/* Putting the sample account in the store, and taking it out again. */

import { blankChronicleState, useChronicle } from "../store";
import { setActiveAccount } from "../account/scope";
import { deactivateAccount } from "../account/session";
import { leaveDemo } from "./mode";

/**
 * The sample account, in memory only. No account is active, so the store's
 * every write is dropped (lib/account/scope.ts) and nothing of it reaches
 * this browser's storage. The sample itself is downloaded only when the demo
 * opens, so the app's pages don't carry it.
 */
export async function loadSampleAccount(now: Date = new Date()): Promise<void> {
  const { buildSampleChronicle } = await import("./sample-chronicle");
  setActiveAccount(null);
  useChronicle.setState(blankChronicleState());
  useChronicle.getState().applyCloudSnapshot(buildSampleChronicle(now));
  useChronicle.setState({ _hasHydrated: true });
}

/**
 * Leaves the demo: the flag goes, memory is blanked, and the next page is a
 * full load, so nothing of the sample survives in this tab.
 */
export function exitDemo(to: string): void {
  leaveDemo();
  deactivateAccount();
  window.location.assign(to);
}
