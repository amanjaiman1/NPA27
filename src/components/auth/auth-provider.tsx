"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, isCloudConfigured, AUTH_STORAGE_KEY } from "@/lib/supabase";
import { authErrorCode, describeAuthError } from "@/lib/auth-errors";
import { clearSigningOut, markSigningOut, signingOutUser } from "@/lib/sign-out-marker";

/** The signed-in person, as the app needs them. */
export interface AccountUser {
  id: string;
  email: string | null;
  /** The name given at sign-up, until the profile has its own. */
  name: string | null;
}

export type AuthStatus = "loading" | "signedIn" | "signedOut";

export interface AuthResult {
  error?: string;
  code?: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AccountUser | null;
  /** Whether accounts exist at all in this build (Supabase configured). */
  cloudEnabled: boolean;
  /**
   * Signed in from the session saved on this device while the auth server
   * can't be reached. Local data is available; sync resumes once it can.
   */
  offline: boolean;
  /**
   * Why the last session ended: `signedOut` when the student signed out in this
   * tab, `ended` when it expired or was ended elsewhere.
   */
  endedReason: "ended" | "signedOut" | null;
  /** Where a sign-out in this tab asked to go next ("/welcome" unless it said otherwise). */
  landing: string | null;
  /**
   * The signed-in session's access token as last seen, for requests that must
   * go out before the session ends (stopping push on sign-out). Reads no
   * storage and never waits for the network.
   */
  accessToken: () => string | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (input: {
    name: string;
    email: string;
    password: string;
  }) => Promise<AuthResult & { needsConfirmation?: boolean }>;
  resendConfirmation: (email: string) => Promise<AuthResult>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  /** Re-checks the current password, for sensitive actions. */
  verifyPassword: (password: string) => Promise<AuthResult>;
  updateName: (name: string) => Promise<AuthResult>;
  /**
   * Ends the session on this device only. Data clean-up is the account
   * session's job (see `useAccount().signOut`), which calls this last.
   * Resolves once this device is signed out, within SIGN_OUT_WAIT_MS however
   * slow the server is; telling the server may finish afterwards.
   */
  signOut: (options?: { landing?: string; waitMs?: number }) => Promise<void>;
}

/**
 * How long signing out waits for the auth server to confirm before this
 * device signs out without its answer. The library's request carries on in
 * the background (see `signOut`).
 */
export const SIGN_OUT_WAIT_MS = 1_200;
/** How long signing in waits for a sign-out that is still finishing in the background. */
const SIGN_IN_AFTER_SIGN_OUT_WAIT_MS = 15_000;
const TIMED_OUT = Symbol("timed out");

const AuthContext = createContext<AuthContextValue | null>(null);

function toAccountUser(user: User): AccountUser {
  const meta = (user.user_metadata ?? {}) as { full_name?: unknown; name?: unknown };
  const name = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : null;
  return { id: user.id, email: user.email ?? null, name: name?.trim() || null };
}

function sameUser(a: AccountUser | null, b: AccountUser): boolean {
  return Boolean(a && a.id === b.id && a.email === b.email && a.name === b.name);
}

/**
 * The user in the session saved on this device, when it still has a refresh
 * token. None while that account's sign-out is still finishing here.
 */
export function readStoredSessionUser(): AccountUser | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as { refresh_token?: string; user?: User };
    if (!s.refresh_token || !s.user?.id || s.user.id === signingOutUser()) return null;
    return toAccountUser(s.user);
  } catch {
    return null;
  }
}

/** Removes the saved session without asking the server — the offline fallback. */
function dropStoredSession() {
  try {
    for (const suffix of ["", "-user", "-code-verifier"]) localStorage.removeItem(AUTH_STORAGE_KEY + suffix);
  } catch {
    /* storage unavailable */
  }
}

const origin = () => (typeof window === "undefined" ? "" : window.location.origin);

/**
 * Whether this page started with a session saved on the device. Read as the
 * module loads, before the auth client has had a chance to check it: when the
 * server then turns it down (signed out everywhere, password changed), the
 * client deletes it before telling anyone, and without this a session that
 * ended would look like one that never existed.
 */
const hadSessionAtStart = typeof window !== "undefined" && readStoredSessionUser() !== null;

interface State {
  status: AuthStatus;
  user: AccountUser | null;
  offline: boolean;
  endedReason: "ended" | "signedOut" | null;
  landing: string | null;
}

/** `promise`'s value, or TIMED_OUT once `ms` have passed. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), ms);
    void promise.then((v) => {
      clearTimeout(timer);
      resolve(v);
    });
  });
}

/**
 * The library's sign-out for this device, as a promise of its error (null
 * when it ended the session). It tells the server, then removes the saved
 * session and announces SIGNED_OUT. It never rejects.
 */
function librarySignOut(): Promise<unknown> {
  if (!supabase) return Promise.resolve(null);
  return supabase.auth.signOut({ scope: "local" }).then(
    ({ error }) => error ?? null,
    (e: unknown) => e ?? new Error("Sign-out failed."),
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({
    status: isCloudConfigured ? "loading" : "signedOut",
    user: null,
    offline: false,
    endedReason: null,
    landing: null,
  });
  const signingOut = useRef(false);
  const landingRef = useRef<string | null>(null);
  /** The library's sign-out while it is still running, for signing in to wait on. */
  const pendingSignOut = useRef<Promise<void> | null>(null);
  const userRef = useRef<AccountUser | null>(null);
  const tokenRef = useRef<string | null>(null);
  userRef.current = state.user;

  useEffect(() => {
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      tokenRef.current = session?.access_token ?? null;
      if (event === "SIGNED_OUT") {
        setState({
          status: "signedOut",
          user: null,
          offline: false,
          endedReason: signingOut.current ? "signedOut" : "ended",
          landing: signingOut.current ? landingRef.current : null,
        });
        signingOut.current = false;
        landingRef.current = null;
        clearSigningOut();
        return;
      }
      if (session) {
        // The account being signed out on this device stays signed out, whatever
        // the library reports while it finishes (a token refreshed on its way
        // out, or a reload before it was done).
        if (session.user.id === signingOutUser()) {
          tokenRef.current = null;
          setState((prev) =>
            prev.status === "signedOut" ? prev : { status: "signedOut", user: null, offline: false, endedReason: "signedOut", landing: null },
          );
          if (event === "INITIAL_SESSION" && !pendingSignOut.current) finishSignOut(librarySignOut());
          return;
        }
        if (event === "SIGNED_IN") clearSigningOut();
        const next = toAccountUser(session.user);
        setState((prev) => ({
          status: "signedIn",
          user: sameUser(prev.user, next) ? prev.user : next,
          offline: false,
          endedReason: null,
          landing: null,
        }));
        return;
      }
      if (event === "INITIAL_SESSION") {
        // No usable session. If one is saved but couldn't be refreshed (no
        // network), keep working offline with it rather than locking the
        // student out of their own data. If the one this page started with is
        // gone, the server ended it: say so on the sign-in screen.
        const stored = readStoredSessionUser();
        setState({
          status: stored ? "signedIn" : "signedOut",
          user: stored,
          offline: Boolean(stored),
          endedReason: !stored && hadSessionAtStart ? "ended" : null,
          landing: null,
        });
      }
    });
    return () => sub.subscription.unsubscribe();
    // `finishSignOut` only uses refs and module functions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Lets the library's sign-out finish in the background. When it couldn't
   * end the session (no network: the library keeps the saved session when the
   * server can't be told), the saved session is removed here. That is safe at
   * this point and not before: the library has stopped working on the session,
   * so nothing can write it back.
   */
  function finishSignOut(ended: Promise<unknown>): Promise<void> {
    const run = ended
      .then((error) => {
        if (error !== null) {
          // No SIGNED_OUT will come: this was the end of it.
          dropStoredSession();
          signingOut.current = false;
          landingRef.current = null;
        }
        clearSigningOut();
      })
      .finally(() => {
        if (pendingSignOut.current === run) pendingSignOut.current = null;
      });
    pendingSignOut.current = run;
    return run;
  }

  /** Before a new session starts, the last one has to be fully gone, or its tail could remove the new one. */
  const settlePendingSignOut = useCallback(async () => {
    const pending = pendingSignOut.current;
    if (pending) await within(pending, SIGN_IN_AFTER_SIGN_OUT_WAIT_MS);
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { error: "Accounts aren't configured in this build." };
    await settlePendingSignOut();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? { error: describeAuthError(error), code: authErrorCode(error) } : {};
  }, [settlePendingSignOut]);

  const signUp = useCallback<AuthContextValue["signUp"]>(async ({ name, email, password }) => {
    if (!supabase) return { error: "Accounts aren't configured in this build." };
    await settlePendingSignOut();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim() },
        emailRedirectTo: `${origin()}/auth/callback`,
      },
    });
    if (error) return { error: describeAuthError(error), code: authErrorCode(error) };
    // With email confirmation on, Supabase answers an already-registered email
    // with a user that has no identities, so as not to reveal who has signed up.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { error: describeAuthError({ code: "user_already_exists" }), code: "user_already_exists" };
    }
    return { needsConfirmation: Boolean(data.user) && !data.session };
  }, [settlePendingSignOut]);

  const resendConfirmation = useCallback(async (email: string): Promise<AuthResult> => {
    if (!supabase) return { error: "Accounts aren't configured in this build." };
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: `${origin()}/auth/callback` },
    });
    return error ? { error: describeAuthError(error), code: authErrorCode(error) } : {};
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    if (!supabase) return { error: "Accounts aren't configured in this build." };
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${origin()}/reset-password`,
    });
    return error ? { error: describeAuthError(error), code: authErrorCode(error) } : {};
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<AuthResult> => {
    if (!supabase) return { error: "Accounts aren't configured in this build." };
    const { error } = await supabase.auth.updateUser({ password });
    return error ? { error: describeAuthError(error), code: authErrorCode(error) } : {};
  }, []);

  const verifyPassword = useCallback(async (password: string): Promise<AuthResult> => {
    const email = userRef.current?.email;
    if (!supabase || !email) return { error: "You need to be signed in." };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error && authErrorCode(error) === "invalid_credentials") return { error: "That password isn't right." };
    return error ? { error: describeAuthError(error), code: authErrorCode(error) } : {};
  }, []);

  const updateName = useCallback(async (name: string): Promise<AuthResult> => {
    if (!supabase) return {};
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    return error ? { error: describeAuthError(error) } : {};
  }, []);

  /**
   * Ending the session on this device, without waiting on a slow server:
   *
   *   - The account is marked as signing out (`sign-out-marker.ts`), so a
   *     reload, the app's gate or the home page never take it back as signed
   *     in while this finishes.
   *   - The library's sign-out runs as usual: it tells the server, removes the
   *     saved session and announces SIGNED_OUT, which moves the app on.
   *   - If it hasn't finished within SIGN_OUT_WAIT_MS (a slow connection), or
   *     it reports that the server couldn't be told (offline), this device is
   *     signed out regardless: the app moves on now, and the library finishes
   *     in the background (`finishSignOut`), removing the saved session itself
   *     if it couldn't.
   *
   * Calling it again while it runs returns the same sign-out.
   */
  const signOutRun = useRef<Promise<void> | null>(null);
  const signOut = useCallback(async ({ landing, waitMs = SIGN_OUT_WAIT_MS }: { landing?: string; waitMs?: number } = {}) => {
    if (!supabase) return;
    if (signOutRun.current) return signOutRun.current;
    const run = (async () => {
      signingOut.current = true;
      landingRef.current = landing ?? null;
      const userId = userRef.current?.id;
      if (userId) markSigningOut(userId);
      tokenRef.current = null;
      const ended = librarySignOut();
      const first = await within(ended, waitMs);
      if (first === null) return; // ended by the library; SIGNED_OUT has moved the app on
      setState({ status: "signedOut", user: null, offline: false, endedReason: "signedOut", landing: landing ?? null });
      void finishSignOut(first === TIMED_OUT ? ended : Promise.resolve(first));
    })().finally(() => {
      signOutRun.current = null;
    });
    signOutRun.current = run;
    return run;
    // `finishSignOut` only uses refs and module functions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accessToken = useCallback(() => tokenRef.current, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      accessToken,
      cloudEnabled: isCloudConfigured,
      signIn,
      signUp,
      resendConfirmation,
      requestPasswordReset,
      updatePassword,
      verifyPassword,
      updateName,
      signOut,
    }),
    [state, accessToken, signIn, signUp, resendConfirmation, requestPasswordReset, updatePassword, verifyPassword, updateName, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
