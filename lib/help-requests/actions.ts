"use server";
// Ask for help: the ? menu's Ask for help and My requests, and the board's
// Help Requests page. Everything goes through the admin client after the
// checks here (0173 gives the tables to service_role only): anyone signed in
// asks and reads their own requests; the board (isStaff) reads and answers
// all of them.

import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "../supabase/admin";
import { getAuthUser, getViewer } from "../auth/viewer";
import { sendHelpReplySlack, sendHelpRequestSlack } from "../notifications/slack";
import {
  browserLabel,
  checkHelpUpload,
  cleanContext,
  HELP_BUCKET,
  helpUploadExt,
  isHelpUploadPath,
  parseHelpBody,
  safePageUrl,
  type HelpMessage,
  type HelpRequest,
  type HelpUploadKind,
} from "./model.ts";

type Result<T = object> = ({ error?: undefined } & T) | { error: string };

const COLS =
  "id, user_id, asker_name, asker_email, body, page_url, page_title, user_agent, screenshot_path, video_path, asker_unread, needs_reply, closed_at, closed_by, slack_channel, slack_ts, created_at, updated_at";

interface Row {
  id: string;
  user_id: string;
  asker_name: string;
  asker_email: string | null;
  body: string;
  page_url: string | null;
  page_title: string | null;
  user_agent: string | null;
  screenshot_path: string | null;
  video_path: string | null;
  asker_unread: boolean;
  needs_reply: boolean;
  closed_at: string | null;
  closed_by: string | null;
  slack_channel: string | null;
  slack_ts: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  request_id: string;
  from_asker: boolean;
  author_name: string;
  body: string;
  created_at: string;
}

// Who is asking: their name from the member record when they have one,
// otherwise their email.
async function me(): Promise<{ userId: string; memberId: string | null; name: string; email: string | null; isStaff: boolean } | null> {
  const user = await getAuthUser();
  if (!user) return null;
  const viewer = await getViewer();
  let name = "";
  if (viewer?.memberId) {
    const { data } = await createAdminClient()
      .from("members")
      .select("full_name, nickname")
      .eq("id", viewer.memberId)
      .maybeSingle();
    const m = data as { full_name: string | null; nickname: string | null } | null;
    name = (m?.full_name || m?.nickname || "").trim();
  }
  return {
    userId: user.id,
    memberId: viewer?.memberId ?? null,
    name: name || user.email || "Someone",
    email: user.email,
    isStaff: viewer?.isStaff ?? false,
  };
}

async function signed(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await createAdminClient().storage.from(HELP_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

async function toRequests(rows: Row[]): Promise<HelpRequest[]> {
  if (rows.length === 0) return [];
  const { data } = await createAdminClient()
    .from("help_request_messages")
    .select("id, request_id, from_asker, author_name, body, created_at")
    .in("request_id", rows.map(r => r.id))
    .order("created_at", { ascending: true });
  const byRequest = new Map<string, HelpMessage[]>();
  for (const m of (data ?? []) as MessageRow[]) {
    const list = byRequest.get(m.request_id) ?? [];
    list.push({ id: m.id, fromAsker: m.from_asker, authorName: m.author_name, body: m.body, createdAt: m.created_at });
    byRequest.set(m.request_id, list);
  }
  return Promise.all(
    rows.map(async r => ({
      id: r.id,
      askerName: r.asker_name,
      askerEmail: r.asker_email,
      body: r.body,
      pageUrl: r.page_url,
      pageTitle: r.page_title,
      browser: browserLabel(r.user_agent),
      screenshotUrl: await signed(r.screenshot_path),
      videoUrl: await signed(r.video_path),
      askerUnread: r.asker_unread,
      needsReply: r.needs_reply,
      closedAt: r.closed_at,
      closedBy: r.closed_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      messages: byRequest.get(r.id) ?? [],
    })),
  );
}

// A signed upload link for one screenshot or video, under the asker's own
// folder. The browser sends the file straight to storage with it.
export async function startHelpUpload(input: {
  kind: HelpUploadKind;
  contentType: string;
  size: number;
}): Promise<Result<{ path: string; token: string }>> {
  const who = await me();
  if (!who) return { error: "Sign in again, then try once more." };
  const kind: HelpUploadKind = input.kind === "video" ? "video" : "screenshot";
  const bad = checkHelpUpload(kind, String(input.contentType ?? ""), Number(input.size));
  if (bad) return { error: bad };
  const path = `${who.userId}/${kind}-${randomUUID()}.${helpUploadExt(input.contentType)}`;
  const { data, error } = await createAdminClient().storage.from(HELP_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "Couldn't start the upload. Try again." };
  return { path: data.path, token: data.token };
}

export async function sendHelpRequest(input: {
  body: string;
  pageUrl?: string;
  pageTitle?: string;
  userAgent?: string;
  screenshotPath?: string | null;
  videoPath?: string | null;
}): Promise<Result<{ id: string }>> {
  const who = await me();
  if (!who) return { error: "Sign in again, then try once more." };
  const parsed = parseHelpBody(input.body);
  if (!parsed.ok) return { error: parsed.error };
  const screenshot = isHelpUploadPath("screenshot", who.userId, input.screenshotPath) ? input.screenshotPath : null;
  const video = isHelpUploadPath("video", who.userId, input.videoPath) ? input.videoPath : null;

  const admin = createAdminClient();
  const row = {
    user_id: who.userId,
    member_id: who.memberId,
    asker_name: who.name,
    asker_email: who.email,
    body: parsed.body,
    page_url: safePageUrl(input.pageUrl),
    page_title: cleanContext(input.pageTitle),
    user_agent: cleanContext(input.userAgent),
    screenshot_path: screenshot,
    video_path: video,
  };
  const { data, error } = await admin.from("help_requests").insert(row).select("id").single();
  if (error || !data) return { error: "Couldn't send it. Try again." };
  const id = (data as { id: string }).id;

  after(async () => {
    const attached = [screenshot && "a screenshot", video && "a video"].filter((x): x is string => !!x);
    const posted = await sendHelpRequestSlack({
      requestId: id,
      askerName: who.name,
      body: parsed.body,
      pageTitle: row.page_title,
      pageUrl: row.page_url,
      attached,
    });
    if (posted) {
      await admin.from("help_requests").update({ slack_channel: posted.channel, slack_ts: posted.ts }).eq("id", id);
    }
  });
  revalidatePath("/portal/help-requests");
  return { id };
}

/** My requests, newest activity first. */
export async function listMyHelpRequests(): Promise<Result<{ requests: HelpRequest[] }>> {
  const who = await me();
  if (!who) return { error: "Sign in again, then try once more." };
  const { data, error } = await createAdminClient()
    .from("help_requests")
    .select(COLS)
    .eq("user_id", who.userId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return { error: "Couldn't load your requests." };
  return { requests: await toRequests((data ?? []) as Row[]) };
}

/** Board replies I haven't opened yet: the dot on ?. */
export async function countMyUnreadHelp(): Promise<number> {
  const user = await getAuthUser();
  if (!user) return 0;
  const { count } = await createAdminClient()
    .from("help_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("asker_unread", true);
  return count ?? 0;
}

/** Opening a request under My requests clears its dot. */
export async function markMyHelpRead(id: string): Promise<void> {
  const user = await getAuthUser();
  if (!user) return;
  await createAdminClient()
    .from("help_requests")
    .update({ asker_unread: false })
    .eq("id", id)
    .eq("user_id", user.id);
}

async function addMessage(
  request: Row,
  who: { name: string },
  fromAsker: boolean,
  body: string,
  patch: Record<string, unknown>,
  closed = false,
): Promise<Result> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("help_request_messages")
    .insert({ request_id: request.id, from_asker: fromAsker, author_name: who.name, body });
  if (error) return { error: "Couldn't send the reply. Try again." };
  await admin
    .from("help_requests")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", request.id);
  if (request.slack_channel && request.slack_ts) {
    const channel = request.slack_channel;
    const threadTs = request.slack_ts;
    after(() => sendHelpReplySlack({ channel, threadTs, authorName: who.name, fromAsker, body, closed }));
  }
  revalidatePath("/portal/help-requests");
  return {};
}

async function loadRow(id: string): Promise<Row | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createAdminClient().from("help_requests").select(COLS).eq("id", id).maybeSingle();
  return (data as Row | null) ?? null;
}

/** The asker writes back on their own request (reopens it if it was closed). */
export async function replyToMyHelpRequest(id: string, body: string): Promise<Result> {
  const who = await me();
  if (!who) return { error: "Sign in again, then try once more." };
  const parsed = parseHelpBody(body);
  if (!parsed.ok) return { error: parsed.error };
  const row = await loadRow(id);
  if (!row || row.user_id !== who.userId) return { error: "That request isn't there anymore." };
  return addMessage(row, who, true, parsed.body, { needs_reply: true, closed_at: null, closed_by: null });
}

// ---- The board: Help Requests ----

async function board() {
  const who = await me();
  return who?.isStaff ? who : null;
}

export async function listHelpRequests(show: "open" | "closed"): Promise<Result<{ requests: HelpRequest[] }>> {
  if (!(await board())) return { error: "Only the board can see help requests." };
  let q = createAdminClient().from("help_requests").select(COLS);
  q = show === "open" ? q.is("closed_at", null) : q.not("closed_at", "is", null);
  const { data, error } = await q.order("updated_at", { ascending: false }).limit(show === "open" ? 200 : 100);
  if (error) return { error: "Couldn't load help requests." };
  return { requests: await toRequests((data ?? []) as Row[]) };
}

/** The board answers. `close` also closes it (Reply and close). */
export async function replyToHelpRequest(id: string, body: string, close = false): Promise<Result> {
  const who = await board();
  if (!who) return { error: "Only the board can answer help requests." };
  const parsed = parseHelpBody(body);
  if (!parsed.ok) return { error: parsed.error };
  const row = await loadRow(id);
  if (!row) return { error: "That request isn't there anymore." };
  return addMessage(
    row,
    who,
    false,
    parsed.body,
    close
      ? { asker_unread: true, needs_reply: false, closed_at: new Date().toISOString(), closed_by: who.name }
      : { asker_unread: true, needs_reply: false },
    close,
  );
}

export async function setHelpRequestClosed(id: string, closed: boolean): Promise<Result> {
  const who = await board();
  if (!who) return { error: "Only the board can close help requests." };
  const row = await loadRow(id);
  if (!row) return { error: "That request isn't there anymore." };
  const { error } = await createAdminClient()
    .from("help_requests")
    .update(
      closed
        ? { closed_at: new Date().toISOString(), closed_by: who.name, needs_reply: false }
        : { closed_at: null, closed_by: null },
    )
    .eq("id", id);
  if (error) return { error: "Couldn't save that. Try again." };
  revalidatePath("/portal/help-requests");
  return {};
}

/** Requests waiting on the board, for the sidebar count. */
export async function countHelpNeedingReply(): Promise<number> {
  if (!(await board())) return 0;
  const { count } = await createAdminClient()
    .from("help_requests")
    .select("id", { count: "exact", head: true })
    .is("closed_at", null)
    .eq("needs_reply", true);
  return count ?? 0;
}
