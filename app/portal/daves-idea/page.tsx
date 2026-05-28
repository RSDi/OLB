import type { Metadata, Viewport } from "next";
import { DavesIdea } from "./DavesIdea";
import { loadDavesIdeaRecordings, loadDavesIdeaViewer } from "../../../lib/daves-idea/data";

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

export default async function DavesIdeaPage() {
  await loadDavesIdeaViewer();
  const recordings = await loadDavesIdeaRecordings();
  return <DavesIdea initialRecordings={recordings} />;
}
