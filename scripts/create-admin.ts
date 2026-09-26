/*
 * Sets up portal admins who sign in with an email and password.
 *
 * Usage:
 *   npm run create-admin -- --password '<temporary password>' <email> [<email> …]
 *   npm run create-admin -- --role admin --password '…' <email>
 *
 * For each email: makes sure there's a confirmed Supabase Auth account with
 * that password (an existing account gets its password reset), then gives it
 * an approved members row, Super-admin by default or Building Committee with
 * --role admin. Safe to re-run.
 *
 * The members column firewall (members_enforce_self_update_columns) lets only
 * a signed-in super-admin change an existing row's role, status or login link;
 * it rejects the service role. So someone who already has a member row (say
 * they signed up and are pending) is reported rather than promoted, and a
 * super-admin changes them under Settings → Members. Rows that were deleted or
 * had their login revoked are left alone.
 *
 * Needs .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * The password is a starting one: each person sets their own at
 * /reset-password once signed in.
 */

import { parseArgs } from "node:util";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "../lib/supabase/admin";
import { exactRegex } from "../lib/supabase/filters";
import type { MemberRole } from "../lib/auth/permissions";

const USAGE =
  "Usage: npm run create-admin -- --password <password> [--role super_admin|admin] <email> [<email> …]";

// As Settings → Members names them.
const ROLE_LABELS: Partial<Record<MemberRole, string>> = {
  super_admin: "Super-admin",
  admin: "Building Committee",
};

type AdminClient = ReturnType<typeof createAdminClient>;

interface MemberRow {
  id: string;
  user_id: string | null;
  email: string | null;
  status: string;
  role: string;
  deleted_at: string | null;
  access_revoked_at: string | null;
}

const MEMBER_COLUMNS = "id, user_id, email, status, role, deleted_at, access_revoked_at";

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      password: { type: "string" },
      role: { type: "string", default: "super_admin" },
    },
  });

  const role = values.role as MemberRole;
  const emails = [...new Set(positionals.map((e) => e.trim().toLowerCase()))];
  const notEmails = emails.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  const problems = [
    !values.password && "--password is required",
    !ROLE_LABELS[role] && `--role must be super_admin or admin, not "${values.role}"`,
    emails.length === 0 && "give at least one email",
    notEmails.length > 0 && `not an email: ${notEmails.join(", ")}`,
  ].filter(Boolean);
  if (problems.length > 0) {
    console.error(`[create-admin] ${problems.join("; ")}.\n${USAGE}`);
    process.exit(1);
  }

  const admin = createAdminClient();
  const accounts = await listAccounts(admin);
  let failed = 0;
  for (const email of emails) {
    try {
      const done = await setUp(admin, accounts.get(email), email, values.password!, role);
      console.log(`[create-admin] ${email}: ${done}`);
    } catch (err) {
      failed++;
      console.error(`[create-admin] ${email}: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (failed > 0) process.exit(1);
}

async function setUp(
  admin: AdminClient,
  account: User | undefined,
  email: string,
  password: string,
  role: MemberRole,
): Promise<string> {
  // Check the member row before touching the sign-in, so someone a
  // super-admin removed doesn't get a working password back.
  const member = await findMember(admin, account?.id ?? null, email);
  if (member?.deleted_at) {
    throw new Error("their member row is deleted. Restore it under Settings → Deleted, then re-run.");
  }
  if (member?.access_revoked_at) {
    throw new Error("their portal login was revoked. Restore it under Settings → Members, then re-run.");
  }

  let userId: string;
  let did: string;
  if (account) {
    const { error } = await admin.auth.admin.updateUserById(account.id, { password, email_confirm: true });
    if (error) throw new Error(`couldn't set the password: ${error.message}`);
    userId = account.id;
    did = "password reset";
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`couldn't create the sign-in: ${error?.message}`);
    userId = data.user.id;
    did = "sign-in created";
  }

  const label = ROLE_LABELS[role];
  if (!member) {
    const { error } = await admin.from("members").insert({
      user_id: userId,
      email,
      status: "approved",
      role,
      reviewed_at: new Date().toISOString(),
    });
    if (error) throw new Error(`${did}, but adding their member row failed: ${error.message}`);
    return `${did}; added as ${label}.`;
  }

  const changes = {
    ...(member.user_id !== userId && { user_id: userId }),
    ...(member.status !== "approved" && { status: "approved", reviewed_at: new Date().toISOString() }),
    ...(member.role !== role && { role }),
  };
  if (Object.keys(changes).length === 0) return `${did}; already ${label}.`;

  const { error } = await admin.from("members").update(changes).eq("id", member.id);
  if (error) {
    const state = [member.status, member.role, !member.user_id && "no sign-in linked"].filter(Boolean).join(", ");
    // Settings → Members can approve and change roles, but can't link a row.
    const hint = "user_id" in changes ? "" : ` A super-admin can make them ${label} under Settings → Members.`;
    throw new Error(
      `${did}, but they already have a member row (${state}) the database won't change: ${error.message}.${hint}`,
    );
  }
  return `${did}; existing member row made approved ${label}.`;
}

// Their member row: the one linked to their sign-in, else the one with their
// email (a directory entry made before they had a sign-in).
async function findMember(admin: AdminClient, userId: string | null, email: string): Promise<MemberRow | null> {
  if (userId) {
    const { data, error } = await admin.from("members").select(MEMBER_COLUMNS).eq("user_id", userId).maybeSingle();
    if (error) throw new Error(`couldn't look up their member row: ${error.message}`);
    if (data) return data as MemberRow;
  }
  const { data, error } = await admin
    .from("members")
    .select(MEMBER_COLUMNS)
    .regexIMatch("email", exactRegex(email))
    .maybeSingle();
  if (error) throw new Error(`couldn't look up their member row: ${error.message}`);
  return data as MemberRow | null;
}

// Every sign-in, keyed by email. Pages until an empty page rather than
// trusting nextPage (auth-js reads only its first digit, so it breaks past
// page 9) or the page size (the server may cap it).
async function listAccounts(admin: AdminClient): Promise<Map<string, User>> {
  const byEmail = new Map<string, User>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`couldn't list sign-ins: ${error.message}`);
    if (data.users.length === 0) return byEmail;
    for (const user of data.users) {
      if (user.email) byEmail.set(user.email.toLowerCase(), user);
    }
  }
}

main().catch((err) => {
  console.error(`[create-admin] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
