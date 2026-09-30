// Unit tests for the auth error translator (A9). The regression case at the
// bottom is the one we actually hit: the email-validation pattern swallowed
// code/token errors until the patterns were tightened.
import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyAuthError } from "../../lib/auth/friendly-error.ts";

test("rate limit becomes plain English", () => {
  assert.match(friendlyAuthError("email rate limit exceeded"), /wait a few minutes/i);
});

test("OTP cooldown becomes plain English", () => {
  assert.match(
    friendlyAuthError("For security purposes, you can only request this after 7 seconds."),
    /code was just sent/i,
  );
});

test("bad credentials point at Forgot password", () => {
  assert.match(friendlyAuthError("Invalid login credentials"), /don't match/i);
});

test("unconfirmed email explains the link", () => {
  assert.match(friendlyAuthError("Email not confirmed"), /confirmation link/i);
});

test("already registered points to the sign-in code and Forgot password?", () => {
  const msg = friendlyAuthError("User already registered");
  assert.match(msg, /sign-in code/i);
  assert.match(msg, /Forgot password\?/);
});

test("invalid email address gets the typo message", () => {
  assert.match(
    friendlyAuthError('Email address "x@example.com" is invalid'),
    /doesn't look right/i,
  );
});

test("unknown account via OTP points at Request access", () => {
  assert.match(friendlyAuthError("Signups not allowed for otp"), /couldn't find an account/i);
});

test("short password gets the 8-character rule", () => {
  assert.match(friendlyAuthError("Password should be at least 6 characters"), /8 characters/i);
});

test("REGRESSION: wrong code is a code error, not an email-typo error", () => {
  const msg = friendlyAuthError("Token has expired or is invalid");
  assert.match(msg, /code didn't match or has expired/i);
  assert.doesNotMatch(msg, /email address/i);
});

test("unknown errors pass through unchanged", () => {
  assert.equal(friendlyAuthError("some brand new supabase error"), "some brand new supabase error");
});

test("empty input gets a generic message", () => {
  assert.match(friendlyAuthError(""), /something went wrong/i);
  assert.match(friendlyAuthError(null), /something went wrong/i);
});
