// device_pairings reads and writes. Service role only — the table has RLS
// on and no authenticated/anon policies.

import { createAdminClient } from "../supabase/admin";
import {
  APPROVE_WINDOW_MS,
  DEVICE_SESSION_TTL_MS,
  MAX_PENDING,
  PAIR_TTL_MS,
  START_WINDOW_MS,
  hmacUserCode,
  pairingExpired,
  sameHash,
  type PairingStatus,
} from "./pairing";

export interface PairingRow {
  id: string;
  host: string;
  secret_hash: string;
  user_code_hmac: string;
  status: PairingStatus;
  wrong_picks: number;
  device_ua: string;
  device_ip: string | null;
  device_city: string | null;
  created_at: string;
  expires_at: string;
  approved_at: string | null;
  approved_by_email: string | null;
  approved_by_user_id: string | null;
  approver_sid: string | null;
  approver_ip: string | null;
  consumed_at: string | null;
  session_id: string | null;
  session_expires_at: string | null;
  last_poll_at: string | null;
  revoked_at: string | null;
  revoked_by_email: string | null;
}

const COLS =
  "id, host, secret_hash, user_code_hmac, status, wrong_picks, device_ua, device_ip, device_city, created_at, expires_at, approved_at, approved_by_email, approved_by_user_id, approver_sid, approver_ip, consumed_at, session_id, session_expires_at, last_poll_at, revoked_at, revoked_by_email";

function admin() {
  return createAdminClient();
}

export async function insertPairing(input: {
  id: string;
  host: string;
  secretHash: string;
  userCodeHmac: string;
  deviceUa: string;
  deviceIp: string | null;
  deviceCity: string | null;
  now?: Date;
}): Promise<PairingRow> {
  const now = input.now ?? new Date();
  const { data, error } = await admin()
    .from("device_pairings")
    .insert({
      id: input.id,
      host: input.host,
      secret_hash: input.secretHash,
      user_code_hmac: input.userCodeHmac,
      status: "pending",
      device_ua: input.deviceUa,
      device_ip: input.deviceIp,
      device_city: input.deviceCity,
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + PAIR_TTL_MS).toISOString(),
    })
    .select(COLS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't start a pairing.");
  return data as PairingRow;
}

export async function loadPairing(id: string): Promise<PairingRow | null> {
  const { data, error } = await admin().from("device_pairings").select(COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PairingRow | null) ?? null;
}

export async function countRecentStarts(ip: string | null, now = Date.now()): Promise<number> {
  if (!ip) return 0;
  const since = new Date(now - START_WINDOW_MS).toISOString();
  const { count, error } = await admin()
    .from("device_pairings")
    .select("id", { count: "exact", head: true })
    .eq("device_ip", ip)
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function countPending(): Promise<number> {
  const { count, error } = await admin()
    .from("device_pairings")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString());
  if (error) throw new Error(error.message);
  return Math.min(count ?? 0, MAX_PENDING + 1);
}

export async function countRecentApprovals(email: string, now = Date.now()): Promise<number> {
  const since = new Date(now - APPROVE_WINDOW_MS).toISOString();
  const { count, error } = await admin()
    .from("device_pairings")
    .select("id", { count: "exact", head: true })
    .eq("approved_by_email", email.toLowerCase())
    .not("approved_at", "is", null)
    .gte("approved_at", since);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markLastPoll(id: string, at = new Date()): Promise<void> {
  const { error } = await admin().from("device_pairings").update({ last_poll_at: at.toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function expireIfNeeded(row: PairingRow, now = Date.now()): Promise<PairingRow> {
  if (row.status !== "pending" && row.status !== "approved") return row;
  if (!pairingExpired(row.expires_at, now) && row.status === "pending") return row;
  if (row.status === "pending" && pairingExpired(row.expires_at, now)) {
    const { data } = await admin()
      .from("device_pairings")
      .update({ status: "expired" })
      .eq("id", row.id)
      .eq("status", "pending")
      .select(COLS)
      .maybeSingle();
    return (data as PairingRow | null) ?? { ...row, status: "expired" };
  }
  if (row.status === "approved" && pairingExpired(row.expires_at, now) && !row.consumed_at) {
    const { data } = await admin()
      .from("device_pairings")
      .update({ status: "expired" })
      .eq("id", row.id)
      .eq("status", "approved")
      .is("consumed_at", null)
      .select(COLS)
      .maybeSingle();
    return (data as PairingRow | null) ?? { ...row, status: "expired" };
  }
  return row;
}

export async function denyPairing(id: string): Promise<PairingRow | null> {
  const { data, error } = await admin()
    .from("device_pairings")
    .update({ status: "denied" })
    .eq("id", id)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .select(COLS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PairingRow | null) ?? null;
}

export async function rejectWrongCode(id: string): Promise<PairingRow | null> {
  const { data, error } = await admin()
    .from("device_pairings")
    .update({ status: "denied", wrong_picks: 1 })
    .eq("id", id)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .select(COLS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PairingRow | null) ?? null;
}

export async function approvePairing(input: {
  id: string;
  email: string;
  userId: string;
  sid: string | null;
  ip: string | null;
  expectedHmac: string;
  pickedCode: string;
  secret: string;
}): Promise<{ row: PairingRow | null; wrong: boolean }> {
  if (!sameHash(input.expectedHmac, hmacUserCode(input.pickedCode, input.secret))) {
    const denied = await rejectWrongCode(input.id);
    return { row: denied, wrong: true };
  }
  const now = new Date().toISOString();
  const { data, error } = await admin()
    .from("device_pairings")
    .update({
      status: "approved",
      approved_at: now,
      approved_by_email: input.email.toLowerCase(),
      approved_by_user_id: input.userId,
      approver_sid: input.sid,
      approver_ip: input.ip,
    })
    .eq("id", input.id)
    .eq("status", "pending")
    .gt("expires_at", now)
    .select(COLS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { row: (data as PairingRow | null) ?? null, wrong: false };
}

export async function consumePairing(input: {
  id: string;
  secretHash: string;
  sessionId: string;
  now?: Date;
}): Promise<PairingRow | null> {
  const now = input.now ?? new Date();
  const { data, error } = await admin()
    .from("device_pairings")
    .update({
      status: "consumed",
      consumed_at: now.toISOString(),
      session_id: input.sessionId,
      session_expires_at: new Date(now.getTime() + DEVICE_SESSION_TTL_MS).toISOString(),
    })
    .eq("id", input.id)
    .eq("status", "approved")
    .eq("secret_hash", input.secretHash)
    .gt("expires_at", now.toISOString())
    .is("consumed_at", null)
    .select(COLS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PairingRow | null) ?? null;
}

export async function revokePairing(input: {
  id: string;
  email: string;
  onlyMine?: string;
}): Promise<PairingRow | null> {
  const now = new Date().toISOString();
  let q = admin()
    .from("device_pairings")
    .update({
      status: "revoked",
      revoked_at: now,
      revoked_by_email: input.email.toLowerCase(),
    })
    .eq("id", input.id)
    .in("status", ["consumed", "approved"]);
  if (input.onlyMine) q = q.eq("approved_by_email", input.onlyMine.toLowerCase());
  const { data, error } = await q.select(COLS).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PairingRow | null) ?? null;
}

export async function revokeAllFor(email: string): Promise<PairingRow[]> {
  const now = new Date().toISOString();
  const { data, error } = await admin()
    .from("device_pairings")
    .update({
      status: "revoked",
      revoked_at: now,
      revoked_by_email: email.toLowerCase(),
    })
    .eq("approved_by_email", email.toLowerCase())
    .in("status", ["consumed", "approved"])
    .select(COLS);
  if (error) throw new Error(error.message);
  return (data as PairingRow[] | null) ?? [];
}

export async function listSignedInDevices(email: string): Promise<PairingRow[]> {
  const { data, error } = await admin()
    .from("device_pairings")
    .select(COLS)
    .eq("approved_by_email", email.toLowerCase())
    .eq("status", "consumed")
    .is("revoked_at", null)
    .gt("session_expires_at", new Date().toISOString())
    .order("consumed_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as PairingRow[] | null) ?? [];
}

export async function loadDeviceSession(id: string): Promise<PairingRow | null> {
  const { data, error } = await admin().from("device_pairings").select(COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PairingRow | null) ?? null;
}
