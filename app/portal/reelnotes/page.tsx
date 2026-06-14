import type { Metadata, Viewport } from "next";
import { ReelNotes } from "reelnotes/ui";
import {
  loadAssignableMembers,
  loadReelNotesRecordings,
  loadReelNotesViewer,
  loadThingsEnabled,
} from "../../../lib/reelnotes/data";
import { softDeleteReelNotesRecording, createProjectFromReelNotes } from "../../../lib/reelnotes/actions";

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
  await loadReelNotesViewer();
  const [{ r, t }, recordings, members, thingsEnabled] = await Promise.all([
    searchParams,
    loadReelNotesRecordings(),
    loadAssignableMembers(),
    loadThingsEnabled(),
  ]);
  return (
    <ReelNotes
      initialRecordings={recordings}
      members={members}
      initialSelectedId={r ?? null}
      focusActionId={t ?? null}
      supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
      supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
      onSoftDelete={softDeleteReelNotesRecording}
      onCreateProject={createProjectFromReelNotes}
      thingsEnabled={thingsEnabled}
    />
  );
}
