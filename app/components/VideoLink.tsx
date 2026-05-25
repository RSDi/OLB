"use client";

import { useState } from "react";

interface Props {
  href: string;
  title: string;
}

type Kind = "youtube" | "vimeo" | "file" | "other";

interface Detected {
  kind: Kind;
  embedUrl?: string;
}

function detect(url: string): Detected {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    // YouTube — youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id) return { kind: "youtube", embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1` };
      const m = u.pathname.match(/^\/embed\/([^/?#]+)/);
      if (m) return { kind: "youtube", embedUrl: `https://www.youtube.com/embed/${m[1]}?autoplay=1` };
    }
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split(/[/?#]/)[0];
      if (id) return { kind: "youtube", embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1` };
    }

    // Vimeo — vimeo.com/ID, player.vimeo.com/video/ID
    if (host === "vimeo.com") {
      const m = u.pathname.match(/^\/(\d+)/);
      if (m) return { kind: "vimeo", embedUrl: `https://player.vimeo.com/video/${m[1]}?autoplay=1` };
    }
    if (host === "player.vimeo.com") {
      const m = u.pathname.match(/^\/video\/(\d+)/);
      if (m) return { kind: "vimeo", embedUrl: `https://player.vimeo.com/video/${m[1]}?autoplay=1` };
    }

    // Direct video file by extension.
    if (/\.(mp4|webm|mov|m4v|ogg|ogv)(\?.*)?$/i.test(u.pathname)) {
      return { kind: "file" };
    }
  } catch {
    // Fall through to "other".
  }
  return { kind: "other" };
}

export function VideoLink({ href, title }: Props) {
  const [playing, setPlaying] = useState(false);
  const det = detect(href);

  // Unknown URL — fall back to a plain link so we never silently break content.
  if (det.kind === "other") {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--rsd-accent)" }}>
        {title}
      </a>
    );
  }

  const sourceLabel =
    det.kind === "youtube" ? "YouTube" :
    det.kind === "vimeo"   ? "Vimeo"   :
    "Video";

  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        className="rsd-md-video-card"
        aria-label={`Play ${title}`}
      >
        <span className="rsd-md-video-card-play" aria-hidden>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6,4 20,12 6,20" />
          </svg>
        </span>
        <span className="rsd-md-video-card-text">
          <span className="rsd-md-video-card-title">{title}</span>
          <span className="rsd-md-video-card-source">{sourceLabel} · click to play</span>
        </span>
      </button>
    );
  }

  if (det.kind === "file") {
    return (
      <video
        src={href}
        controls
        autoPlay
        className="rsd-md-video-player"
      />
    );
  }

  // YouTube / Vimeo iframe embed.
  return (
    <div className="rsd-md-video-player-wrap">
      <iframe
        src={det.embedUrl}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        className="rsd-md-video-player-iframe"
      />
    </div>
  );
}
