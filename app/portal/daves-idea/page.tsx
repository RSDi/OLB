import type { Metadata, Viewport } from "next";
import { DavesIdea } from "./DavesIdea";
import {
  loadAssignableMembers,
  loadDavesIdeaRecordings,
  loadDavesIdeaViewer,
} from "../../../lib/daves-idea/data";

export const metadata: Metadata = {
  title: "Dave's Idea",
  manifest: "/daves-idea-manifest.webmanifest",
  icons: {
    icon: "/daves-idea-icon.svg",
    apple: "/daves-idea-icon.svg",
  },
  appleWebApp: {
    title: "Dave's Idea",
    statusBarStyle: "black-translucent",
    capable: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#6C8C59",
};

export default async function DavesIdeaPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; t?: string }>;
}) {
  await loadDavesIdeaViewer();
  const [{ r, t }, recordings, members] = await Promise.all([
    searchParams,
    loadDavesIdeaRecordings(),
    loadAssignableMembers(),
  ]);
  return (
    <DavesIdea
      initialRecordings={recordings}
      members={members}
      initialSelectedId={r ?? null}
      focusActionId={t ?? null}
    />
  );
}
