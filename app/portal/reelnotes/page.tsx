import type { Metadata, Viewport } from "next";
import { ReelNotes } from "reelnotes/ui";
import {
  loadAssignableMembers,
  loadReelNotesRecordings,
  loadReelNotesViewer,
  loadReelNotesSourceLinks,
  loadThingsEnabled,
} from "../../../lib/reelnotes/data";
import { softDeleteReelNotesRecording } from "../../../lib/reelnotes/actions";

export const metadata: Metadata = {
  title: "ReelNotes",
  manifest: "/reelnotes-manifest.webmanifest",
  icons: {
    icon: "/reelnotes-icon.svg",
    apple: "/reelnotes-icon.svg",
  },
  appleWebApp: {
    title: "ReelNotes",
    statusBarStyle: "black-translucent",
    capable: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#6C8C59",
};

export default async function ReelNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; t?: string }>;
}) {
  const viewer = await loadReelNotesViewer();
  const [{ r, t }, recordings, members, thingsEnabled] = await Promise.all([
    searchParams,
    loadReelNotesRecordings(),
    loadAssignableMembers(),
    loadThingsEnabled(),
  ]);
  // "Source" backlinks: a task-recorded note links back to its task.
  const sourceLinks = await loadReelNotesSourceLinks(recordings);
  return (
    <ReelNotes
      initialRecordings={recordings}
      members={members}
      initialSelectedId={r ?? null}
      focusActionId={t ?? null}
      supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
      supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
      onSoftDelete={softDeleteReelNotesRecording}
      thingsEnabled={thingsEnabled}
      canDelete={viewer.isSuperAdmin}
      sourceLinks={sourceLinks}
    />
  );
}
