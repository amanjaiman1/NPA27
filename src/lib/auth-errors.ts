/**
 * Supabase auth errors, in words a student can act on. Keyed by the stable
 * `code` Supabase returns; anything unrecognised falls back to its message.
 */
const MESSAGES: Record<string, string> = {
  invalid_credentials: "That email and password don't match an account.",
  email_not_confirmed: "Confirm your email first. The link is in your inbox.",
  user_already_exists: "An account with this email already exists. Sign in instead.",
  email_exists: "An account with this email already exists. Sign in instead.",
  weak_password: "Choose a stronger password: at least 8 characters, with letters and numbers.",
  same_password: "That's your current password. Choose a new one.",
  over_email_send_rate_limit: "Too many emails sent. Wait a few minutes and try again.",
  over_request_rate_limit: "Too many attempts. Wait a minute and try again.",
  email_address_not_authorized:
    "Email can't be sent to this address yet. The app's owner needs to set up email delivery (see the README).",
  email_address_invalid: "That email address doesn't look right.",
  signup_disabled: "New sign-ups are closed for this app.",
  otp_expired: "This link has expired or was already used. Request a new one.",
  session_expired: "Your session ended. Sign in again.",
  session_not_found: "Your session ended. Sign in again.",
  refresh_token_not_found: "Your session ended. Sign in again.",
  user_not_found: "No account was found for that email.",
  validation_failed: "Check the details you entered and try again.",
};

const NETWORK = "Couldn't reach the server. Check your connection and try again.";

export function describeAuthError(error: unknown): string {
  if (!error) return "Something went wrong. Try again.";
  const e = error as { code?: string; message?: string; name?: string; status?: number };
  if (e.code && MESSAGES[e.code]) return MESSAGES[e.code];
  if (e.name === "AuthRetryableFetchError" || e.status === 0) return NETWORK;
  if (/fetch|network|load failed/i.test(e.message ?? "")) return NETWORK;
  if (/rate limit/i.test(e.message ?? "")) return MESSAGES.over_request_rate_limit;
  return e.message || "Something went wrong. Try again.";
}

export function authErrorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

/** The rules a new password has to meet, checked before anything is sent. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) return "Mix letters and numbers.";
  return null;
}

export function emailProblem(email: string): string | null {
  const value = email.trim();
  if (!value) return "Enter your email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "That email address doesn't look right.";
  return null;
}
