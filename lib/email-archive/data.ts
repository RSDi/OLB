// Server loaders for Archives → Email. Reads go through the viewer's session
// so RLS (staff-only, same as planning_meetings) decides.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../supabase/server.ts";
import { relationMissing } from "../agent/schema.ts";
import { monthKeyOf, monthLabel, type MonthKey } from "../planning/season.ts";

export type EmailArchiveAttachment = {
  id: string;
  filename: string;
  mime: string;
  sizeBytes: number | null;
  storagePath: string;
};

export type EmailArchiveMessage = {
  id: string;
  gmailMessageId: string;
  from: string;
  to: string[];
  cc: string[];
  sentAt: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  snippet: string;
  attachments: EmailArchiveAttachment[];
};

export type EmailArchiveLink = {
  id: string;
  meetingId: string;
  meetingMonth: MonthKey | null;
  meetingLabel: string;
  agendaItemLabel: string;
};

export type EmailArchiveThreadListItem = {
  id: string;
  gmailThreadId: string;
  sourceMailbox: string;
  subject: string;
  participants: string[];
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  messageCount: number;
  addedBy: string | null;
  createdAt: string;
  snippet: string;
  attachmentCount: number;
  links: EmailArchiveLink[];
};

export type EmailArchiveThreadDetail = EmailArchiveThreadListItem & {
  messages: EmailArchiveMessage[];
};

function missingTable(error: { message: string } | null): boolean {
  return Boolean(error && relationMissing(error.message, "email_archive"));
}

function toLink(row: {
  id: string;
  agenda_item_label: string;
  planning_meeting_id: string;
  meeting?: { month: string } | { month: string }[] | null;
}): EmailArchiveLink {
  const meeting = Array.isArray(row.meeting) ? row.meeting[0] : row.meeting;
  const month = meeting?.month ? monthKeyOf(meeting.month) : null;
  return {
    id: row.id,
    meetingId: row.planning_meeting_id,
    meetingMonth: month,
    meetingLabel: month ? `${monthLabel(month)} board meeting` : "Board meeting",
    agendaItemLabel: row.agenda_item_label,
  };
}

export async function loadEmailThreadList(opts: {
  q?: string;
  mailbox?: string;
  meetingId?: string;
} = {}): Promise<{ threads: EmailArchiveThreadListItem[]; missingTable: boolean }> {
  const supabase = await createClient();
  let query = supabase
    .from("email_archive_threads")
    .select(
      "id, gmail_thread_id, source_mailbox, subject, participants, first_message_at, last_message_at, message_count, added_by, created_at, links:email_archive_links(id, agenda_item_label, planning_meeting_id, meeting:planning_meetings(month))",
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (opts.mailbox) query = query.eq("source_mailbox", opts.mailbox);
  if (opts.q) {
    const needle = opts.q.replace(/,/g, " ").trim();
    if (needle) query = query.or(`subject.ilike.%${needle}%,source_mailbox.ilike.%${needle}%`);
  }
  const { data, error } = await query;
  if (error) {
    if (missingTable(error)) return { threads: [], missingTable: true };
    console.error("[email-archive] list", error.message);
    return { threads: [], missingTable: false };
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  let threads = rows.map(listItemFromRow);
  if (opts.meetingId) {
    threads = threads.filter((t) => t.links.some((l) => l.meetingId === opts.meetingId));
  }
  await attachSnippets(supabase, threads);
  return { threads, missingTable: false };
}

function listItemFromRow(row: Record<string, unknown>): EmailArchiveThreadListItem {
  const linksRaw = (row.links as Parameters<typeof toLink>[0][] | null) ?? [];
  return {
    id: String(row.id),
    gmailThreadId: String(row.gmail_thread_id),
    sourceMailbox: String(row.source_mailbox),
    subject: String(row.subject ?? ""),
    participants: Array.isArray(row.participants) ? (row.participants as string[]) : [],
    firstMessageAt: (row.first_message_at as string | null) ?? null,
    lastMessageAt: (row.last_message_at as string | null) ?? null,
    messageCount: Number(row.message_count ?? 0),
    addedBy: (row.added_by as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
    snippet: "",
    attachmentCount: 0,
    links: linksRaw.map(toLink),
  };
}

async function attachSnippets(supabase: SupabaseClient, threads: EmailArchiveThreadListItem[]): Promise<void> {
  if (threads.length === 0) return;
  const ids = threads.map((t) => t.id);
  const { data } = await supabase
    .from("email_archive_messages")
    .select("thread_id, snippet, sent_at, id")
    .in("thread_id", ids)
    .order("sent_at", { ascending: false });
  const latest = new Map<string, string>();
  const messageIds: string[] = [];
  for (const row of (data as { thread_id: string; snippet: string; id: string }[] | null) ?? []) {
    if (!latest.has(row.thread_id)) {
      latest.set(row.thread_id, row.snippet ?? "");
      messageIds.push(row.id);
    }
  }
  const { data: atts } = await supabase
    .from("email_archive_attachments")
    .select("message_id")
    .in("message_id", messageIds.length ? messageIds : ["00000000-0000-0000-0000-000000000000"]);
  const byMessage = new Map<string, number>();
  for (const a of (atts as { message_id: string }[] | null) ?? []) {
    byMessage.set(a.message_id, (byMessage.get(a.message_id) ?? 0) + 1);
  }
  // Attachment counts for the whole thread, not just the latest message.
  const { data: allMsgs } = await supabase
    .from("email_archive_messages")
    .select("id, thread_id")
    .in("thread_id", ids);
  const msgToThread = new Map<string, string>();
  for (const m of (allMsgs as { id: string; thread_id: string }[] | null) ?? []) msgToThread.set(m.id, m.thread_id);
  const allIds = [...msgToThread.keys()];
  const { data: allAtts } = allIds.length
    ? await supabase.from("email_archive_attachments").select("message_id").in("message_id", allIds)
    : { data: [] as { message_id: string }[] };
  const threadAtt = new Map<string, number>();
  for (const a of (allAtts as { message_id: string }[] | null) ?? []) {
    const threadId = msgToThread.get(a.message_id);
    if (threadId) threadAtt.set(threadId, (threadAtt.get(threadId) ?? 0) + 1);
  }
  for (const t of threads) {
    t.snippet = latest.get(t.id) ?? "";
    t.attachmentCount = threadAtt.get(t.id) ?? 0;
  }
}

export async function loadEmailThread(gmailThreadId: string): Promise<EmailArchiveThreadDetail | null | { missingTable: true }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_archive_threads")
    .select(
      "id, gmail_thread_id, source_mailbox, subject, participants, first_message_at, last_message_at, message_count, added_by, created_at, links:email_archive_links(id, agenda_item_label, planning_meeting_id, meeting:planning_meetings(month))",
    )
    .eq("gmail_thread_id", gmailThreadId)
    .maybeSingle();
  if (error) {
    if (missingTable(error)) return { missingTable: true };
    console.error("[email-archive] thread", error.message);
    return null;
  }
  if (!data) return null;
  const thread = listItemFromRow(data as Record<string, unknown>);
  const { data: msgs } = await supabase
    .from("email_archive_messages")
    .select("id, gmail_message_id, from_addr, to_addrs, cc_addrs, sent_at, subject, body_text, body_html, snippet")
    .eq("thread_id", thread.id)
    .order("sent_at", { ascending: true });
  const messages = ((msgs as Record<string, unknown>[] | null) ?? []).map((m) => ({
    id: String(m.id),
    gmailMessageId: String(m.gmail_message_id),
    from: String(m.from_addr ?? ""),
    to: Array.isArray(m.to_addrs) ? (m.to_addrs as string[]) : [],
    cc: Array.isArray(m.cc_addrs) ? (m.cc_addrs as string[]) : [],
    sentAt: String(m.sent_at),
    subject: String(m.subject ?? ""),
    bodyText: String(m.body_text ?? ""),
    bodyHtml: String(m.body_html ?? ""),
    snippet: String(m.snippet ?? ""),
    attachments: [] as EmailArchiveAttachment[],
  }));
  const msgIds = messages.map((m) => m.id);
  if (msgIds.length) {
    const { data: atts } = await supabase
      .from("email_archive_attachments")
      .select("id, message_id, filename, mime, size_bytes, storage_path")
      .in("message_id", msgIds);
    const byMsg = new Map<string, EmailArchiveAttachment[]>();
    for (const a of (atts as Record<string, unknown>[] | null) ?? []) {
      const item: EmailArchiveAttachment = {
        id: String(a.id),
        filename: String(a.filename),
        mime: String(a.mime ?? ""),
        sizeBytes: typeof a.size_bytes === "number" ? a.size_bytes : null,
        storagePath: String(a.storage_path),
      };
      const list = byMsg.get(String(a.message_id)) ?? [];
      list.push(item);
      byMsg.set(String(a.message_id), list);
    }
    for (const m of messages) m.attachments = byMsg.get(m.id) ?? [];
  }
  thread.attachmentCount = messages.reduce((n, m) => n + m.attachments.length, 0);
  thread.snippet = messages[messages.length - 1]?.snippet ?? "";
  return { ...thread, messages };
}

export async function loadEmailCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("email_archive_threads")
    .select("id", { count: "exact", head: true });
  if (error) return 0;
  return count ?? 0;
}

export async function loadMeetingEmailLinks(meetingId: string | null): Promise<EmailArchiveThreadListItem[]> {
  if (!meetingId) return [];
  const { threads } = await loadEmailThreadList({ meetingId });
  return threads;
}

export async function lookupAttachmentPath(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<EmailArchiveAttachment | null> {
  const { data, error } = await supabase
    .from("email_archive_attachments")
    .select("id, filename, mime, size_bytes, storage_path")
    .eq("storage_path", storagePath)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    filename: String(row.filename),
    mime: String(row.mime ?? ""),
    sizeBytes: typeof row.size_bytes === "number" ? row.size_bytes : null,
    storagePath: String(row.storage_path),
  };
}
