// Service-role writes for POST /api/agent/email-archive. Callers must already
// have passed the Bearer + email_archive:write check.

import { revalidatePath } from "next/cache";
import { createAdminClient } from "../supabase/admin.ts";
import { relationMissing } from "../agent/schema.ts";
import { emailThreadHref } from "../slack-archive/paths.ts";
import { emailAttachmentStoragePath, uploadEmailAttachment } from "./files.ts";
import { importResponseBody, type ParsedEmailImport } from "./parse.ts";

export type EmailImportResult = ReturnType<typeof importResponseBody>;

async function resolveMeetingId(
  admin: ReturnType<typeof createAdminClient>,
  link: ParsedEmailImport["links"][number],
): Promise<{ id: string } | { warning: string }> {
  if (link.planningMeetingId) {
    const { data, error } = await admin
      .from("planning_meetings")
      .select("id")
      .eq("id", link.planningMeetingId)
      .maybeSingle();
    if (error) return { warning: `Couldn't look up that board meeting (${error.message}).` };
    if (!data) return { warning: "No board meeting matches that planningMeetingId." };
    return { id: (data as { id: string }).id };
  }
  const month = link.month!;
  const { data, error } = await admin
    .from("planning_meetings")
    .select("id")
    .eq("month", `${month}-01`)
    .maybeSingle();
  if (error) return { warning: `Couldn't look up the ${month} board meeting (${error.message}).` };
  if (!data) return { warning: `No ${month} board meeting is saved yet, so that link was skipped.` };
  return { id: (data as { id: string }).id };
}

export async function importEmailArchiveThread(parsed: ParsedEmailImport): Promise<
  { ok: true; body: EmailImportResult } | { error: string; status: number }
> {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "SUPABASE_SERVICE_ROLE_KEY not set; cannot import email.", status: 500 };
  }

  const first = parsed.messages[0];
  const last = parsed.messages[parsed.messages.length - 1];
  const threadRow = {
    gmail_thread_id: parsed.gmailThreadId,
    source_mailbox: parsed.sourceMailbox,
    subject: parsed.subject,
    participants: parsed.participants,
    first_message_at: first.sentAt,
    last_message_at: last.sentAt,
    message_count: parsed.messages.length,
    added_by: parsed.addedBy,
  };

  const existing = await admin
    .from("email_archive_threads")
    .select("id")
    .eq("gmail_thread_id", parsed.gmailThreadId)
    .maybeSingle();
  if (existing.error) {
    if (relationMissing(existing.error.message, "email_archive_threads")) {
      return { error: "Run migration 0149 (email archive) in the Supabase SQL editor first.", status: 503 };
    }
    return { error: existing.error.message, status: 500 };
  }

  let threadId: string;
  let created = false;
  if (existing.data) {
    threadId = (existing.data as { id: string }).id;
    const { error } = await admin.from("email_archive_threads").update(threadRow).eq("id", threadId);
    if (error) return { error: error.message, status: 500 };
  } else {
    const { data, error } = await admin.from("email_archive_threads").insert(threadRow).select("id").single();
    if (error || !data) return { error: error?.message ?? "Couldn't save the thread.", status: 500 };
    threadId = (data as { id: string }).id;
    created = true;
  }

  const warnings: string[] = [];

  for (const msg of parsed.messages) {
    const messageRow = {
      thread_id: threadId,
      gmail_message_id: msg.gmailMessageId,
      from_addr: msg.from,
      to_addrs: msg.to,
      cc_addrs: msg.cc,
      sent_at: msg.sentAt,
      subject: msg.subject,
      body_text: msg.bodyText,
      body_html: msg.bodyHtml,
      snippet: msg.snippet,
    };
    const { data, error } = await admin
      .from("email_archive_messages")
      .upsert(messageRow, { onConflict: "gmail_message_id" })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "Couldn't save a message.", status: 500 };
    const messageId = (data as { id: string }).id;

    for (const att of msg.attachments) {
      if (!att.bytes) {
        warnings.push(`Skipped ${att.filename} on ${msg.gmailMessageId}: no file bytes.`);
        continue;
      }
      const storagePath = emailAttachmentStoragePath(parsed.gmailThreadId, msg.gmailMessageId, att.filename);
      const uploaded = await uploadEmailAttachment(admin, storagePath, att.bytes, att.mime);
      if ("error" in uploaded) {
        warnings.push(`Couldn't store ${att.filename}: ${uploaded.error}`);
        continue;
      }
      const { error: attErr } = await admin.from("email_archive_attachments").upsert(
        {
          message_id: messageId,
          filename: att.filename,
          mime: att.mime,
          size_bytes: att.sizeBytes,
          storage_path: storagePath,
        },
        { onConflict: "storage_path" },
      );
      if (attErr) warnings.push(`Saved ${att.filename} in storage but not in the table: ${attErr.message}`);
    }
  }

  for (const link of parsed.links) {
    const meeting = await resolveMeetingId(admin, link);
    if ("warning" in meeting) {
      warnings.push(meeting.warning);
      continue;
    }
    const { error } = await admin.from("email_archive_links").upsert(
      {
        thread_id: threadId,
        planning_meeting_id: meeting.id,
        agenda_item_label: link.agendaItemLabel,
      },
      { onConflict: "thread_id,planning_meeting_id,agenda_item_label" },
    );
    if (error) warnings.push(`Couldn't link to the board meeting: ${error.message}`);
  }

  revalidatePath("/portal/archives/email");
  revalidatePath("/portal/archives");
  revalidatePath("/portal/events");

  return {
    ok: true,
    body: importResponseBody({
      gmailThreadId: parsed.gmailThreadId,
      url: emailThreadHref(parsed.gmailThreadId),
      messageCount: parsed.messages.length,
      created,
      warnings,
    }),
  };
}
