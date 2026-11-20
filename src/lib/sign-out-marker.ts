/* ════════════════════════════════════════════════════════════════
   A SIGN-OUT STILL FINISHING
   Signing out doesn't wait for a slow or unreachable server: this device
   is signed out at once, and the auth library finishes in the background
   (telling the server, removing the saved session). Until it has, the
   saved session is still in the browser, so this marker, the id of the
   account being signed out, makes everything that reads a saved session
   treat it as gone: the app's gate, a reload, and the home page's redirect
   for signed-in visitors (the inline script in app/(marketing)/page.tsx
   reads the same key).

   Device-wide on purpose, not under an account's key: it describes the
   browser's saved session, which is shared by every account here.
   ════════════════════════════════════════════════════════════════ */

export const SIGNING_OUT_KEY = "upsc-chronicle-signing-out";

export function markSigningOut(userId: string): void {
  try {
    localStorage.setItem(SIGNING_OUT_KEY, userId);
  } catch {
    /* storage blocked: the in-memory state still says signed out */
  }
}

export function clearSigningOut(): void {
  try {
    localStorage.removeItem(SIGNING_OUT_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** The account whose sign-out is still finishing on this device, if any. */
export function signingOutUser(): string | null {
  try {
    return localStorage.getItem(SIGNING_OUT_KEY);
  } catch {
    return null;
  }
}
