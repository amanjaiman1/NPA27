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
import { supabase, isCloudConfigured, AUTH_STORAGE_KEY, authRedirectUrl } from "@/lib/supabase";
import { authErrorCode, describeAuthError } from "@/lib/auth-errors";

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
   */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toAccountUser(user: User): AccountUser {
  const meta = (user.user_metadata ?? {}) as { full_name?: unknown; name?: unknown };
  const name = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : null;
  return { id: user.id, email: user.email ?? null, name: name?.trim() || null };
}

function sameUser(a: AccountUser | null, b: AccountUser): boolean {
  return Boolean(a && a.id === b.id && a.email === b.email && a.name === b.name);
}

/** The user in the session saved on this device, when it still has a refresh token. */
export function readStoredSessionUser(): AccountUser | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as { refresh_token?: string; user?: User };
    return s.refresh_token && s.user?.id ? toAccountUser(s.user) : null;
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
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({
    status: isCloudConfigured ? "loading" : "signedOut",
    user: null,
    offline: false,
    endedReason: null,
  });
  const signingOut = useRef(false);
  const userRef = useRef<AccountUser | null>(null);
  userRef.current = state.user;

  useEffect(() => {
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setState({
          status: "signedOut",
          user: null,
          offline: false,
          endedReason: signingOut.current ? "signedOut" : "ended",
        });
        signingOut.current = false;
        return;
      }
      if (session) {
        const next = toAccountUser(session.user);
        setState((prev) => ({
          status: "signedIn",
          user: sameUser(prev.user, next) ? prev.user : next,
          offline: false,
          endedReason: null,
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
        });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { error: "Accounts aren't configured in this build." };
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? { error: describeAuthError(error), code: authErrorCode(error) } : {};
  }, []);

  const signUp = useCallback<AuthContextValue["signUp"]>(async ({ name, email, password }) => {
    if (!supabase) return { error: "Accounts aren't configured in this build." };
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim() },
        emailRedirectTo: authRedirectUrl("/auth/callback"),
      },
    });
    if (error) return { error: describeAuthError(error), code: authErrorCode(error) };
    // With email confirmation on, Supabase answers an already-registered email
    // with a user that has no identities, so as not to reveal who has signed up.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { error: describeAuthError({ code: "user_already_exists" }), code: "user_already_exists" };
    }
    return { needsConfirmation: Boolean(data.user) && !data.session };
  }, []);

  const resendConfirmation = useCallback(async (email: string): Promise<AuthResult> => {
    if (!supabase) return { error: "Accounts aren't configured in this build." };
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: authRedirectUrl("/auth/callback") },
    });
    return error ? { error: describeAuthError(error), code: authErrorCode(error) } : {};
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    if (!supabase) return { error: "Accounts aren't configured in this build." };
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authRedirectUrl("/reset-password"),
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

  const signOut = useCallback(async () => {
    if (!supabase) return;
    signingOut.current = true;
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      // The server couldn't be told (offline). Drop the saved session anyway and
      // restart, which is what signing out on this device means.
      dropStoredSession();
      window.location.replace("/welcome");
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
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
    [state, signIn, signUp, resendConfirmation, requestPasswordReset, updatePassword, verifyPassword, updateName, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
