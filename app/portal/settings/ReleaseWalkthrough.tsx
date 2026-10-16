"use client";
// Step-by-step "Show me how" overlay for a release note. Full-width sheet on
// a phone; a centred card on a larger screen. Optional screenshot, video, or
// a link to the page the step is about.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icons } from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { Pill } from "../../components/ui";
import {
  hasHow,
  mediaKind,
  vimeoEmbedSrc,
  walkthroughSteps,
  youtubeEmbedSrc,
  type ReleaseNote,
} from "../../../lib/release-notes/model";

export function ReleaseWalkthrough({ note, onClose }: { note: ReleaseNote; onClose: () => void }) {
  const slides = walkthroughSteps(note);
  const [i, setI] = useState(0);
  const slide = slides[i] ?? null;
  const last = slides.length - 1;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && i < last) setI((n) => Math.min(n + 1, last));
      if (e.key === "ArrowLeft" && i > 0) setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [i, last, onClose]);

  if (!slide || !hasHow(note)) return null;

  return (
    <div
      className="rsd-how"
      role="dialog"
      aria-modal="true"
      aria-label={`${note.title} — Show me how`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="rsd-how-panel rsd-card">
        <div className="rsd-how-head">
          <div style={{ minWidth: 0 }}>
            <div className="rsd-eyebrow">Show me how · {note.area}</div>
            <div className="rsd-how-kicker">{note.title}</div>
            {slides.length > 1 && (
              <div className="rsd-how-progress">
                Step {i + 1} of {slides.length}
              </div>
            )}
          </div>
          <button type="button" className="gw-press rsd-how-close" aria-label="Close" onClick={onClose}>
            <Icons.X width={18} height={18} />
          </button>
        </div>

        {slides.length > 1 && (
          <div className="rsd-how-dots" aria-hidden="true">
            {slides.map((_, n) => (
              <span key={n} className={n === i ? "is-on" : undefined} />
            ))}
          </div>
        )}

        <div className="rsd-how-body">
          <h3 className="rsd-how-title">{slide.title}</h3>
          <div className="rsd-how-copy">
            <MarkdownView>{slide.body}</MarkdownView>
          </div>
          <HowMedia url={slide.media_url ?? (i === 0 ? note.media_url : null)} title={slide.title} />
          <HowLink href={slide.href ?? (i === 0 ? note.href : null)} />
        </div>

        <div className="rsd-how-foot">
          <Pill variant="ghost" size="sm" onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0}>
            <Icons.ChevronLeft width={14} height={14} /> Back
          </Pill>
          {i < last ? (
            <Pill variant="accent" size="sm" onClick={() => setI((n) => Math.min(last, n + 1))}>
              Next <Icons.ChevronRight width={14} height={14} />
            </Pill>
          ) : (
            <Pill variant="accent" size="sm" onClick={onClose}>
              Done
            </Pill>
          )}
        </div>
      </div>
    </div>
  );
}

function HowLink({ href }: { href: string | null | undefined }) {
  if (!href) return null;
  const outside = href.startsWith("http");
  const label = outside ? "Open this page" : "Go there";
  if (outside) {
    return (
      <a className="rsd-link rsd-how-go" href={href} target="_blank" rel="noreferrer">
        {label} <Icons.ExternalLink width={12} height={12} />
      </a>
    );
  }
  return (
    <Link className="rsd-link rsd-how-go" href={href}>
      {label} <Icons.ArrowRight width={12} height={12} />
    </Link>
  );
}

function HowMedia({ url, title }: { url: string | null | undefined; title: string }) {
  if (!url) return null;
  const kind = mediaKind(url);
  if (kind === "image") {
    return (
      // Arbitrary screenshot URLs; next/image needs a configured host.
      // eslint-disable-next-line @next/next/no-img-element
      <img className="rsd-how-media" src={url} alt={title} loading="lazy" />
    );
  }
  if (kind === "video") {
    return (
      <video className="rsd-how-media" src={url} controls playsInline>
        Your browser can’t play this video.{" "}
        <a href={url} target="_blank" rel="noreferrer">
          Open it instead
        </a>
        .
      </video>
    );
  }
  if (kind === "youtube") {
    const src = youtubeEmbedSrc(url);
    if (src) {
      return (
        <div className="rsd-how-embed">
          <iframe
            src={src}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
  }
  if (kind === "vimeo") {
    const src = vimeoEmbedSrc(url);
    if (src) {
      return (
        <div className="rsd-how-embed">
          <iframe src={src} title={title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
        </div>
      );
    }
  }
  return (
    <a className="rsd-link rsd-how-go" href={url} target="_blank" rel="noreferrer">
      Open screenshot or video <Icons.ExternalLink width={12} height={12} />
    </a>
  );
}

export function ShowHowButton({ note, onClick }: { note: ReleaseNote; onClick: () => void }) {
  if (!hasHow(note)) return null;
  return (
    <Pill variant="accent" size="sm" onClick={onClick} style={{ minHeight: 44 }}>
      <Icons.Play width={14} height={14} /> Show me how
    </Pill>
  );
}
