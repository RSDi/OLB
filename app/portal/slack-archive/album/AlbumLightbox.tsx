"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icons } from "../../../components/icons";
import { MarkdownView } from "../../../components/MarkdownView";
import { CHURCH_TZ } from "../../../../lib/dates/today";
import { albumMediaHref, type AlbumItem } from "../../../../lib/slack-archive/album";
import { emojify } from "../../../../lib/slack-archive/emoji";
import { albumFontVariables } from "./fonts";

const LONG_DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "long", month: "long", day: "numeric", year: "numeric",
  hour: "numeric", minute: "2-digit", timeZone: CHURCH_TZ,
});
const SHORT_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: CHURCH_TZ,
});

// Same heuristic as the channel page's MessageList: only run the Markdown
// pipeline when the text has something Markdown would act on.
const MARKDOWN_SYNTAX = /[*_~`[\]()#>]|\n|https?:\/\//;

const SWIPE_MIN_PX = 50;

function formatBytes(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const PHOTO_FORMATS: Record<string, string> = {
  jpeg: "JPEG", jpg: "JPEG", png: "PNG", gif: "GIF", webp: "WebP",
  heic: "HEIC", heif: "HEIF", "svg+xml": "SVG", avif: "AVIF", tiff: "TIFF", bmp: "BMP",
};

function fileTypeLabel(item: AlbumItem): string {
  if (item.kind === "video") return "Video";
  const format = PHOTO_FORMATS[item.mimetype.split("/")[1]?.toLowerCase() ?? ""];
  return format ? `${format} photo` : "Photo";
}

// Before its preview is generated, a photo's grid image is the signed
// original itself — the viewer reuses that already-downloaded URL instead of
// fetching the same file again, and switches to the media route (which signs
// a fresh URL) only if the page's URL has expired.
function fullImageSrc(item: AlbumItem, viaRoute: boolean): string {
  if (!item.hasThumb && item.thumbUrl && !viaRoute) return item.thumbUrl;
  return albumMediaHref(item.path);
}

function captionSnippet(text: string): string {
  return emojify(text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_~`>#\\]/g, "").replace(/\s+/g, " ").trim());
}

export function AlbumLightbox({
  items,
  index,
  itemsById,
  channelLabels,
  onNavigate,
  onClose,
}: {
  items: AlbumItem[]; // the order prev/next walks — the album's current results
  index: number;
  itemsById: Map<string, AlbumItem>;
  channelLabels: Map<string, string>;
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  const item = items[index];
  const prev = index > 0 ? items[index - 1] : null;
  const next = index < items.length - 1 ? items[index + 1] : null;

  // Details sit beside the photo on wide screens and start hidden (as a
  // bottom sheet) on phones, where the photo needs the whole screen.
  const [infoOpen, setInfoOpen] = useState(() => window.matchMedia("(min-width: 900px)").matches);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [viaRouteId, setViaRouteId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  // Latest values for the document-level key handler, which subscribes once.
  const keyState = useRef({ prev, next, onNavigate, onClose });
  useEffect(() => {
    keyState.current = { prev, next, onNavigate, onClose };
  });

  useEffect(() => {
    closeRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      const { prev: p, next: n, onNavigate: go, onClose: close } = keyState.current;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      // Leave arrow keys to a focused video's own seek controls.
      if (e.target instanceof HTMLVideoElement) return;
      if (e.key === "ArrowLeft" && p) {
        e.preventDefault();
        go(p.id);
      } else if (e.key === "ArrowRight" && n) {
        e.preventDefault();
        go(n.id);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Warm the neighbors so stepping through a post's photos feels instant.
  useEffect(() => {
    for (const n of [next, prev]) {
      if (n?.kind === "image") new Image().src = fullImageSrc(n, false);
    }
  }, [next, prev]);

  if (!item) return null;

  const viaRoute = viaRouteId === item.id;
  const failed = failedId === item.id;
  const loaded = loadedId === item.id;
  const channelLabel = channelLabels.get(item.channelId) ?? item.channelId;
  const conversationHref = `/portal/slack-archive/${encodeURIComponent(item.channelId)}#msg-${item.messageTs}`;
  const downloadHref = albumMediaHref(item.path, { download: item.name });
  const siblings = item.siblingIds.map((id) => itemsById.get(id)).filter((s): s is AlbumItem => Boolean(s));
  const postedAt = new Date(item.postedAt);
  const text = item.text ? emojify(item.text) : "";

  function handleFullError() {
    if (!item.hasThumb && item.thumbUrl && !viaRoute) setViaRouteId(item.id);
    else setFailedId(item.id);
  }

  async function copyLink() {
    const url = `${window.location.origin}/portal/slack-archive/album?photo=${encodeURIComponent(item.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId((id) => (id === item.id ? null : id)), 1500);
    } catch {
      // Clipboard unavailable (insecure context, denied) — nothing to confirm.
    }
  }

  // Keep Tab inside the dialog while it's open.
  function trapFocus(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), video[controls]"),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" || e.target instanceof HTMLVideoElement) return;
    swipeStart.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e: React.PointerEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0 && next) onNavigate(next.id);
    if (dx > 0 && prev) onNavigate(prev.id);
  }

  const kindWord = item.kind === "video" ? "Video" : "Photo";
  const alt = `${kindWord} posted by ${item.author} on ${SHORT_DATE.format(postedAt)}${item.text ? `: ${captionSnippet(item.text).slice(0, 140)}` : ""}`;

  let notice: string | null = null;
  if (failed) {
    notice = item.kind === "video"
      ? "This video can’t play in this browser. Download it to watch."
      : item.hasThumb
        ? "This browser can’t show this file at full size — you’re seeing a preview. Download it for the original."
        : "This browser can’t show this file. Download it to open the original.";
  }

  return createPortal(
    <div
      ref={dialogRef}
      className={`rsd-lightbox ${albumFontVariables}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${kindWord} viewer`}
      onKeyDown={trapFocus}
    >
      <div className="rsd-lightbox-main">
        <div className="rsd-lightbox-bar">
          <div className="rsd-lightbox-count" aria-live="polite">
            {index + 1} of {items.length.toLocaleString("en-US")}
          </div>
          <div className="rsd-lightbox-actions">
            <button
              type="button"
              className="rsd-lightbox-icon-btn"
              aria-pressed={infoOpen}
              aria-label={infoOpen ? "Hide details" : "Show details"}
              title={infoOpen ? "Hide details" : "Show details"}
              onClick={() => setInfoOpen((v) => !v)}
            >
              <Icons.Info width={19} height={19} />
            </button>
            <button
              type="button"
              className="rsd-lightbox-icon-btn"
              aria-label={copiedId === item.id ? "Link copied" : "Copy link"}
              title={copiedId === item.id ? "Link copied" : "Copy link"}
              onClick={copyLink}
            >
              {copiedId === item.id ? <Icons.CheckCircle width={19} height={19} /> : <Icons.Link width={19} height={19} />}
            </button>
            <a className="rsd-lightbox-icon-btn" href={downloadHref} aria-label="Download original" title="Download original">
              <Icons.Download width={19} height={19} />
            </a>
            <button
              ref={closeRef}
              type="button"
              className="rsd-lightbox-icon-btn"
              aria-label="Close"
              title="Close (Esc)"
              onClick={onClose}
            >
              <Icons.X width={21} height={21} />
            </button>
          </div>
        </div>

        <div className="rsd-lightbox-stage" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
          {item.kind === "image" ? (
            <div className="rsd-lightbox-frame">
              {item.hasThumb && item.thumbUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL, not a static asset
                <img className="rsd-lightbox-preview" src={item.thumbUrl} alt="" aria-hidden="true" />
              )}
              {!failed && (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL, not a static asset
                <img
                  key={`${item.id}:${viaRoute ? "route" : "page"}`}
                  className="rsd-lightbox-full"
                  src={fullImageSrc(item, viaRoute)}
                  alt={alt}
                  data-loaded={loaded || !item.hasThumb ? "true" : "false"}
                  onLoad={() => setLoadedId(item.id)}
                  onError={handleFullError}
                />
              )}
              {failed && !item.hasThumb && (
                <div className="rsd-lightbox-missing">
                  <Icons.Image width={40} height={40} />
                  <span>{item.name}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="rsd-lightbox-frame">
              {failed ? (
                item.hasThumb && item.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL, not a static asset
                  <img className="rsd-lightbox-preview" src={item.thumbUrl} alt={alt} />
                ) : (
                  <div className="rsd-lightbox-missing">
                    <Icons.Video width={40} height={40} />
                    <span>{item.name}</span>
                  </div>
                )
              ) : (
                <video
                  key={item.id}
                  src={albumMediaHref(item.path)}
                  poster={item.hasThumb ? (item.thumbUrl ?? undefined) : undefined}
                  controls
                  autoPlay
                  playsInline
                  aria-label={alt}
                  onError={() => setFailedId(item.id)}
                />
              )}
            </div>
          )}

          {prev && (
            <button type="button" className="rsd-lightbox-nav" data-dir="prev" aria-label="Previous" onClick={() => onNavigate(prev.id)}>
              <Icons.ChevronLeft width={26} height={26} />
            </button>
          )}
          {next && (
            <button type="button" className="rsd-lightbox-nav" data-dir="next" aria-label="Next" onClick={() => onNavigate(next.id)}>
              <Icons.ChevronRight width={26} height={26} />
            </button>
          )}
          {notice && (
            <div className="rsd-lightbox-notice" role="status">
              {notice}
            </div>
          )}
        </div>

        {!infoOpen && (
          <button type="button" className="rsd-lightbox-peek" onClick={() => setInfoOpen(true)}>
            <span className="rsd-lightbox-peek-line">
              <span className="rsd-lightbox-peek-who">{item.author}</span>
              <span className="rsd-lightbox-peek-when">{SHORT_DATE.format(postedAt)}</span>
            </span>
            {item.text && <span className="rsd-lightbox-peek-text">{captionSnippet(item.text)}</span>}
          </button>
        )}
      </div>

      {infoOpen && (
        <aside className="rsd-lightbox-panel" aria-label="Details">
          <button type="button" className="rsd-lightbox-sheet-handle" aria-label="Hide details" onClick={() => setInfoOpen(false)} />
          <div className="rsd-lightbox-meta">
            <div className="rsd-lightbox-author">{item.author}</div>
            <div className="rsd-lightbox-when">{LONG_DATE.format(postedAt)}</div>
            <div className="rsd-lightbox-where">
              in{" "}
              <a href={`/portal/slack-archive/${encodeURIComponent(item.channelId)}`} target="_blank" rel="noopener noreferrer">
                {channelLabel}
              </a>
            </div>
          </div>

          {text && (
            <div className="rsd-lightbox-caption">
              {MARKDOWN_SYNTAX.test(text) ? <MarkdownView>{text}</MarkdownView> : <p>{text}</p>}
            </div>
          )}

          {item.parentAuthor !== null && (
            <div className="rsd-lightbox-thread">
              <div className="rsd-lightbox-subhead">Posted in reply to {item.parentAuthor}</div>
              {item.parentText && <blockquote>{captionSnippet(item.parentText)}</blockquote>}
            </div>
          )}

          {siblings.length > 1 && (
            <div>
              <div className="rsd-lightbox-subhead">
                {siblings.length} {siblings.every((s) => s.kind === "video") ? "videos" : siblings.some((s) => s.kind === "video") ? "items" : "photos"} in this post
              </div>
              <div className="rsd-lightbox-strip">
                {siblings.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-label={`${s.kind === "video" ? "Video" : "Photo"}: ${s.name}`}
                    aria-current={s.id === item.id ? "true" : undefined}
                    onClick={() => onNavigate(s.id)}
                  >
                    {s.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL, not a static asset
                      <img src={s.thumbUrl} alt="" loading="lazy" />
                    ) : (
                      <Icons.Video width={16} height={16} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rsd-lightbox-file">
            <div className="rsd-lightbox-file-name">{item.name}</div>
            <div className="rsd-lightbox-file-meta">
              {fileTypeLabel(item)}
              {item.size ? `, ${formatBytes(item.size)}` : ""}
            </div>
          </div>

          <div className="rsd-lightbox-links">
            <a href={conversationHref} target="_blank" rel="noopener noreferrer">
              <Icons.ExternalLink width={15} height={15} /> View in conversation
            </a>
            <a href={downloadHref}>
              <Icons.Download width={15} height={15} /> Download original
            </a>
          </div>
        </aside>
      )}
    </div>,
    document.body,
  );
}
