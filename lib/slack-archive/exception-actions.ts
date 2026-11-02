"use server";

// Lets a super admin clear an attachment off the exceptions page when
// there's nothing to do about it (a file Slack never offered a download
// for, say). The message's other files are left exactly as they are; this
// only flags the one entry (ArchivedFile.dismissed). Written with the admin
// client after the super-admin check, like the sync itself: members can
// only read slack_archive_messages (migration 0084).

import { revalidatePath } from "next/cache";
import { getViewer } from "../auth/viewer";
import { createAdminClient } from "../supabase/admin";
import type { ArchivedFile } from "./files";

export async function dismissArchiveException(messageId: string, fileId: string): Promise<{ error?: string }> {
  const viewer = await getViewer();
  if (!viewer) return { error: "You must be signed in." };
  if (!viewer.isSuperAdmin) return { error: "Super-admin access required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("slack_archive_messages")
    .select("files, updated_at")
    .eq("id", messageId)
    .maybeSingle();
  if (error) return { error: error.message };
  const row = data as { files: ArchivedFile[] | null; updated_at: string } | null;
  if (!row) return { error: "That message is no longer in the archive." };

  const files = row.files ?? [];
  if (!files.some((f) => f.id === fileId)) return { error: "That attachment is no longer on the message." };

  // Only lands if no sync rewrote the row since it was read (updated_at,
  // which every write bumps); otherwise this would undo that sync's files.
  const { data: updated, error: updateError } = await admin
    .from("slack_archive_messages")
    .update({ files: files.map((f) => (f.id === fileId ? { ...f, dismissed: true } : f)) })
    .eq("id", messageId)
    .eq("updated_at", row.updated_at)
    .select("id");
  if (updateError) return { error: updateError.message };
  if (!updated?.length) return { error: "The message changed while saving. Reload and try again." };

  revalidatePath("/portal/archives/slack/exceptions");
  return {};
}
