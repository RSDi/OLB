// Team Playbook shapes shared by the page and the server. A plain module on
// purpose: exporting types from a "use server" file breaks the build.

import type { PlayDiagram } from "./diagram.ts";

export const PLAYBOOK_BUCKET = "team-playbook";

// A few minutes of phone video. The bucket refuses anything larger too (0162).
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

// Stills the browser takes from the video for the reader.
export const FRAME_COUNT = 20;
export const FRAME_WIDTH = 960;

// Signed playback links last a while so a long practice doesn't lose them.
export const VIDEO_LINK_TTL_S = 6 * 60 * 60;

export type PlayStatus = "uploading" | "transcribing" | "reading" | "draft" | "shared" | "failed";

export const PROCESSING: PlayStatus[] = ["uploading", "transcribing", "reading"];

export const CATEGORIES = [
  "Half-court offense",
  "Inbounds: under our basket",
  "Inbounds: sideline",
  "Press break",
  "Zone offense",
  "Defense",
  "Special situations",
] as const;

export interface TranscriptLine {
  text: string;
  start: number; // seconds
  end: number;
}

export interface TeamPlay {
  id: string;
  name: string;
  call_name: string;
  category: string;
  team_ids: string[];
  coach_name: string;
  status: PlayStatus;
  error: string | null;
  diagram: PlayDiagram | null;
  video_name: string;
  video_link: string;
  duration_sec: number | null;
  transcript: TranscriptLine[] | null;
  created_at: string;
  updated_at: string;
  shared_at: string | null;
  // Signed for this page view; null when there's no video.
  video_url: string | null;
}

export interface PlaybookTeam {
  id: string;
  name: string;
}

// What an editor saves from the page.
export interface PlayEdit {
  name: string;
  call_name: string;
  category: string;
  team_ids: string[];
  coach_name: string;
  video_link: string;
  diagram: PlayDiagram;
}
