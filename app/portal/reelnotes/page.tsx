import type { Metadata, Viewport } from "next";
import { ReelNotes } from "./ReelNotes";
import {
  loadAssignableMembers,
  loadReelNotesRecordings,
  loadReelNotesViewer,
} from "../../../lib/reelnotes/data";

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
  const [{ r, t }, recordings, members] = await Promise.all([
    searchParams,
    loadReelNotesRecordings(),
    loadAssignableMembers(),
  ]);
  return (
    <ReelNotes
      initialRecordings={recordings}
      members={members}
      initialSelectedId={r ?? null}
      focusActionId={t ?? null}
    />
  );
}
