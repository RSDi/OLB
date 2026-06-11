// Translate raw Supabase auth errors into plain English for non-technical
// members (A9/U2). Unknown errors pass through unchanged so real problems
// stay debuggable.

const PATTERNS: [RegExp, string][] = [
  [
    /rate limit/i,
    "We've sent a few emails recently and hit a temporary limit. Please wait a few minutes and try again.",
  ],
  [
    /you can only request this after/i,
    "One moment — a code was just sent. Wait a few seconds and try again.",
  ],
  [
    /invalid login credentials/i,
    "That email and password don't match. Check both and try again, or tap “Forgot password?”",
  ],
  [
    /email not confirmed/i,
    "Your email hasn't been confirmed yet — check your inbox for our confirmation link.",
  ],
  [
    /already registered|already been registered/i,
    "There's already an account with this email. Try signing in instead.",
  ],
  [
    // Keep this AFTER any token/code patterns would match — it's for the
    // signup email-validation error ('Email address "x" is invalid').
    /email.+is invalid/i,
    "That email address doesn't look right — double-check it for typos.",
  ],
  [
    /password should be at least/i,
    "Please use a password that's at least 8 characters.",
  ],
  [
    /same password|different from the old/i,
    "Your new password needs to be different from the old one.",
  ],
  [
    /signups not allowed for otp|otp_disabled/i,
    "We couldn't find an account with that email. Double-check the spelling, or tap “Request access” below to join.",
  ],
  [
    /token has expired or is invalid/i,
    "That code didn't match or has expired. Double-check the digits, or request a new code.",
  ],
  [/expired|token.*invalid|invalid.*token/i, "That link has expired. Request a fresh one and try again."],
];

export function friendlyAuthError(message: string | null | undefined): string {
  const raw = (message ?? "").trim();
  if (!raw) return "Something went wrong. Please try again.";
  for (const [pattern, friendly] of PATTERNS) {
    if (pattern.test(raw)) return friendly;
  }
  return raw;
}
