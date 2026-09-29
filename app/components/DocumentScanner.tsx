"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icons } from "./icons";
import {
  AUTO_HOLD_MS,
  AUTO_MIN_FILL,
  AUTO_SETTLE_MS,
  AUTO_STEADY_SHIFT,
  newSteadyTracker,
  pageFingerprint,
  samePage,
  steadyFor,
} from "../../lib/scan/autocapture";
import { detectDocument, toGray } from "../../lib/scan/detect";
import { SCAN_FILTERS, applyScanFilter, type ScanFilter } from "../../lib/scan/enhance";
import {
  fullFrame,
  isConvexQuad,
  outputSize,
  pageAspect,
  quadArea,
  warpPerspective,
  type Point,
  type Quad,
  type RgbaImage,
} from "../../lib/scan/geometry";
import { buildPdf } from "../../lib/scan/pdf";

// A document scanner like the ones built into iPhone and Android: a live
// camera that outlines the page it sees (and, with Auto on, takes the
// picture by itself once the page holds still), corners you can drag onto the
// page, the page laid flat and cleaned up (Color, Grayscale, B&W or the
// Photo as taken), and as many pages as needed saved as one PDF. Everything
// happens in the browser; the parent gets the finished PDF to upload.
// Rendered into document.body, outside the portal's theme, so it carries its
// own colours (like the Slack Archive's lightbox).

const ACCENT = "#FFD100";
const ACCENT_ON = "#0B0B0C";
const MUTED = "rgba(255,255,255,.66)";
const LINE = "rgba(255,255,255,.22)";
// Longest side of a finished page: about 200 dpi on a letter page.
const PAGE_MAX_SIDE = 2200;
// A photo is shrunk to this before anything else; plenty for PAGE_MAX_SIDE.
const PHOTO_MAX_SIDE = 3264;
// Frames are shrunk to this to look for the page: live, and once taken.
const LIVE_DETECT_SIDE = 320;
const PHOTO_DETECT_SIDE = 640;
const JPEG_QUALITY = 0.82;
export const SCAN_MAX_PAGES = 10;
// Whether Auto is on, remembered on this device (on unless turned off).
const AUTO_KEY = "olb-scanner-auto";

interface ScanPage {
  id: number;
  flat: RgbaImage; // the straightened page, before any look
  jpeg: Blob; // with the chosen look
  url: string;
  print: Float32Array; // pageFingerprint(), so Auto doesn't shoot it again
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

// Canvases hold their memory until they're emptied; phones run out fast.
function release(c: HTMLCanvasElement) {
  c.width = 0;
  c.height = 0;
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

// A copy of `source` shrunk to fit in maxSide.
function shrink(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxSide: number,
  scratch?: HTMLCanvasElement
): ImageData | null {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const c = scratch ?? canvasOf(w, h);
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  if (!scratch) release(c);
  return img;
}

// Looks for the page in a shrunk copy of `source`. `quad` is at `source`'s
// own size, `small` at the copy's (`img`).
function lookForPage(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxSide: number,
  scratch?: HTMLCanvasElement
): { img: ImageData; small: Quad; quad: Quad } | null {
  const img = shrink(source, width, height, maxSide, scratch);
  if (!img) return null;
  const small = detectDocument(toGray(img.data, img.width, img.height), img.width, img.height);
  if (!small) return null;
  const quad = small.map((p) => ({ x: (p.x / img.width) * width, y: (p.y / img.height) * height })) as Quad;
  return { img, small, quad };
}

async function withLook(flat: RgbaImage, filter: ScanFilter): Promise<Blob> {
  const data = new Uint8ClampedArray(flat.data);
  applyScanFilter({ data, width: flat.width, height: flat.height }, filter);
  const c = canvasOf(flat.width, flat.height);
  c.getContext("2d")!.putImageData(new ImageData(data, flat.width, flat.height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  release(c);
  if (!blob) throw new Error("Couldn't save the page.");
  return blob;
}

// A picked or taken photo, as a canvas no bigger than PHOTO_MAX_SIDE. The
// browser turns it the right way up as it decodes it.
async function photoFromFile(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = canvasOf(Math.round(img.naturalWidth * scale), Math.round(img.naturalHeight * scale));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function cameraProblem(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access is turned off for this site. Allow the camera in your browser's settings, or use a photo instead.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device.";
  if (name === "NotReadableError" || name === "AbortError") {
    return "Another app is using the camera. Close it and try again, or use a photo instead.";
  }
  return "Couldn't open the camera.";
}

function ScanButton({
  children,
  onClick,
  primary,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="gw-press"
      style={{
        height: 40,
        padding: "0 18px",
        borderRadius: 100,
        border: `1px solid ${primary ? ACCENT : LINE}`,
        background: primary ? ACCENT : "rgba(255,255,255,.06)",
        color: primary ? ACCENT_ON : "#fff",
        fontSize: 14,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        whiteSpace: "nowrap",
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

const barStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 16px",
  flexShrink: 0,
};

// ─── Camera ─────────────────────────────────────────────────────

// What Auto is waiting on, for the hint at the top.
type AutoWait = "closer" | "next" | "hold" | null;

const RING_R = 40;
const RING = 2 * Math.PI * RING_R;

function CameraView({
  backLabel,
  onBack,
  onPhoto,
  auto,
  onAutoChange,
  lastPrint,
}: {
  backLabel: string;
  onBack: () => void;
  onPhoto: (photo: HTMLCanvasElement, seen: Quad | null) => void;
  auto: boolean;
  onAutoChange: (on: boolean) => void;
  // The page scanned last, which Auto won't take again.
  lastPrint: Float32Array | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [live, setLive] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [seen, setSeen] = useState<Quad | null>(null);
  const [wait, setWait] = useState<AutoWait>(null);
  const [held, setHeld] = useState(0); // 0 to 1: how far Auto is to taking it
  const seenRef = useRef<Quad | null>(null);
  // The detection loop reads these, so it needn't restart when they change.
  const autoRef = useRef(auto);
  const lastPrintRef = useRef(lastPrint);
  const shootRef = useRef<() => void>(() => {});
  // The photo picker is open (on iPhone it slides up over a still-running camera).
  const pickingRef = useRef(false);
  useEffect(() => {
    // Not behind an error message, either.
    autoRef.current = auto && !problem;
    lastPrintRef.current = lastPrint;
    shootRef.current = shoot;
  });
  useEffect(() => {
    const input = photoInput.current;
    const done = () => {
      pickingRef.current = false;
    };
    input?.addEventListener("cancel", done);
    return () => input?.removeEventListener("cancel", done);
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    const video = videoRef.current;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setProblem("This browser can't open the camera here. Use a photo instead.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (!video) return;
        // Set before the stream arrives: iPhones only play inline, muted video by themselves.
        video.muted = true;
        video.srcObject = stream;
        await video.play().catch(() => {});
        if (!cancelled) setLive(true);
      } catch (e) {
        if (!cancelled) setProblem(cameraProblem(e));
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    };
  }, [attempt]);

  // Outline the page a few times a second, smoothing the corners so the
  // outline doesn't shake, and dropping it once the page has been gone a bit.
  // With Auto on, take the picture once the page has held still long enough:
  // close enough to read, not the page just scanned, and not while the
  // photo picker (or another app) has the screen.
  useEffect(() => {
    if (!live) return;
    const scratch = canvasOf(1, 1);
    const tracker = newSteadyTracker();
    const readyAt = performance.now() + AUTO_SETTLE_MS;
    let raf = 0;
    let last = 0;
    let misses = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 160) return;
      last = t;
      const v = videoRef.current;
      if (!v || !v.videoWidth || v.readyState < 2) return;
      const look = lookForPage(v, v.videoWidth, v.videoHeight, LIVE_DETECT_SIDE, scratch);
      const found = look?.quad ?? null;

      let waiting: AutoWait = null;
      let steady = 0;
      if (autoRef.current && look && t >= readyAt && !pickingRef.current && document.hasFocus()) {
        const close = quadArea(look.quad) >= v.videoWidth * v.videoHeight * AUTO_MIN_FILL;
        const fresh = !lastPrintRef.current || !samePage(pageFingerprint(look.img, look.small), lastPrintRef.current);
        if (close && fresh) {
          steady = steadyFor(tracker, look.quad, t, Math.max(v.videoWidth, v.videoHeight) * AUTO_STEADY_SHIFT);
          waiting = "hold";
        } else {
          steadyFor(tracker, null, t, 0);
          waiting = close ? "next" : "closer";
        }
      } else {
        steadyFor(tracker, null, t, 0);
      }
      setWait(waiting);
      setHeld(Math.min(1, steady / AUTO_HOLD_MS));
      if (steady >= AUTO_HOLD_MS) {
        cancelAnimationFrame(raf);
        shootRef.current();
        return;
      }

      const prev = seenRef.current;
      if (found) {
        misses = 0;
        const jump = Math.max(v.videoWidth, v.videoHeight) * 0.15;
        const steady = prev && found.every((p, i) => Math.hypot(p.x - prev[i].x, p.y - prev[i].y) < jump);
        const next = steady
          ? (found.map((p, i) => ({ x: prev[i].x + (p.x - prev[i].x) * 0.5, y: prev[i].y + (p.y - prev[i].y) * 0.5 })) as Quad)
          : found;
        seenRef.current = next;
        setSeen(next);
      } else if (++misses >= 3 && prev) {
        seenRef.current = null;
        setSeen(null);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      release(scratch);
    };
  }, [live]);

  function shoot() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
    const c = canvasOf(Math.round(v.videoWidth * scale), Math.round(v.videoHeight * scale));
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    const outline = seenRef.current?.map((p) => ({ x: p.x * scale, y: p.y * scale })) as Quad | undefined;
    onPhoto(c, outline ?? null);
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      onPhoto(await photoFromFile(file), null);
    } catch {
      setProblem("Couldn't open that photo. Try another.");
    }
  }

  function toggleAuto() {
    setHeld(0);
    setWait(null);
    onAutoChange(!auto);
  }

  const hint = problem
    ? ""
    : !seen
      ? "Point the camera at the page"
      : !auto
        ? "Page found — tap the button"
        : wait === "closer"
          ? "Move closer to the page"
          : wait === "next"
            ? "Turn to the next page"
            : "Hold still…";

  const trackSize = () => {
    const v = videoRef.current;
    if (v?.videoWidth) setSize({ w: v.videoWidth, h: v.videoHeight });
  };

  return (
    <>
      <div style={barStyle}>
        <ScanButton onClick={onBack}>{backLabel}</ScanButton>
        <span style={{ fontSize: 13, fontWeight: 600, color: MUTED, textAlign: "right" }}>
          {hint}
        </span>
      </div>

      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          onLoadedMetadata={trackSize}
          onResize={trackSize}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: problem ? "none" : "block",
          }}
        />
        {size && seen && !problem && (
          <svg
            viewBox={`0 0 ${size.w} ${size.h}`}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
          >
            <polygon
              points={seen.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="rgba(255,209,0,.18)"
              stroke={ACCENT}
              strokeWidth={3}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        {problem && (
          <div
            role="alert"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              padding: 24,
              textAlign: "center",
            }}
          >
            <Icons.Camera width={36} height={36} style={{ color: MUTED }} />
            <span style={{ fontSize: 15, fontWeight: 600, maxWidth: 340, lineHeight: 1.45 }}>{problem}</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <ScanButton
                primary
                onClick={() => {
                  pickingRef.current = true;
                  photoInput.current?.click();
                }}
              >
                <Icons.Image width={16} height={16} />
                Use a photo instead
              </ScanButton>
              <ScanButton
                onClick={() => {
                  setProblem(null);
                  setAttempt((n) => n + 1);
                }}
              >
                Try again
              </ScanButton>
            </div>
          </div>
        )}
        {!live && !problem && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: MUTED, fontSize: 14, fontWeight: 600 }}>
            Opening the camera…
          </div>
        )}
      </div>

      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        onChange={(e) => {
          pickingRef.current = false;
          void pickPhoto(e.target.files?.[0]);
          e.target.value = "";
        }}
        style={{ display: "none" }}
      />

      <div
        style={{
          ...barStyle,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          paddingBottom: "calc(20px + env(safe-area-inset-bottom))",
        }}
      >
        <span>
          {!problem && (
            <ScanButton
              onClick={() => {
                pickingRef.current = true;
                photoInput.current?.click();
              }}
              label="Scan a photo you already have"
            >
              <Icons.Image width={16} height={16} />
              Photo
            </ScanButton>
          )}
        </span>
        <span style={{ position: "relative", display: problem ? "none" : "inline-flex", padding: 6 }}>
          <button
            type="button"
            aria-label="Take the scan"
            onClick={shoot}
            disabled={!live}
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              border: `4px solid ${seen ? ACCENT : "#fff"}`,
              padding: 4,
              background: "transparent",
              opacity: live ? 1 : 0.35,
              cursor: live ? "pointer" : "default",
            }}
          >
            <span style={{ display: "block", width: "100%", height: "100%", borderRadius: "50%", background: "#fff" }} />
          </button>
          {/* Fills while Auto waits for the page to hold still. */}
          {auto && held > 0 && (
            <svg
              width={84}
              height={84}
              viewBox="0 0 84 84"
              aria-hidden="true"
              style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)", pointerEvents: "none" }}
            >
              <circle
                cx={42}
                cy={42}
                r={RING_R}
                fill="none"
                stroke={ACCENT}
                strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray={RING}
                strokeDashoffset={RING * (1 - held)}
                style={{ transition: "stroke-dashoffset 160ms linear" }}
              />
            </svg>
          )}
        </span>
        <span style={{ display: "flex", justifyContent: "flex-end" }}>
          {!problem && (
            <button
              type="button"
              aria-pressed={auto}
              onClick={toggleAuto}
              title={auto ? "Takes the picture once the page holds still" : "Tap the round button to take the picture"}
              className="gw-press"
              style={{
                height: 40,
                padding: "0 16px",
                borderRadius: 100,
                border: `1px solid ${auto ? ACCENT : LINE}`,
                background: auto ? "rgba(255,209,0,.14)" : "rgba(255,255,255,.06)",
                color: auto ? ACCENT : MUTED,
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Auto
            </button>
          )}
        </span>
      </div>
    </>
  );
}

// ─── Corners ────────────────────────────────────────────────────

const STAGE_PAD = 28;
const LOUPE = 112;
const LOUPE_ZOOM = 3;

function CornerEditor({
  photo,
  initial,
  backLabel,
  onBack,
  onAsIs,
  onKeep,
}: {
  photo: HTMLCanvasElement;
  initial: Quad;
  backLabel: string;
  onBack: () => void;
  // For a photo from Upload scan: attach it untouched instead.
  onAsIs?: () => void;
  onKeep: (quad: Quad) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef<HTMLCanvasElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null);
  const [quad, setQuad] = useState<Quad>(initial);
  const [dragging, setDragging] = useState<number | null>(null);
  const grab = useRef<{ index: number; dx: number; dy: number } | null>(null);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = stage
    ? (() => {
        const scale = Math.max(
          0.01,
          Math.min((stage.w - STAGE_PAD * 2) / photo.width, (stage.h - STAGE_PAD * 2) / photo.height)
        );
        const dw = photo.width * scale;
        const dh = photo.height * scale;
        return { scale, dw, dh, ox: (stage.w - dw) / 2, oy: (stage.h - dh) / 2 };
      })()
    : null;

  // Draw the photo at the size it's shown (sharp on high-density screens).
  useEffect(() => {
    const c = shownRef.current;
    if (!c || !fit) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(fit.dw * dpr);
    c.height = Math.round(fit.dh * dpr);
    c.getContext("2d")!.drawImage(photo, 0, 0, c.width, c.height);
  }, [photo, fit?.dw, fit?.dh]); // eslint-disable-line react-hooks/exhaustive-deps

  const screen = (p: Point) => (fit ? { x: fit.ox + p.x * fit.scale, y: fit.oy + p.y * fit.scale } : p);

  // A magnified view of the corner being dragged, since a finger covers it.
  useEffect(() => {
    const c = loupeRef.current;
    if (dragging === null || !c || !fit) return;
    const dpr = window.devicePixelRatio || 1;
    const px = LOUPE * dpr;
    if (c.width !== px) c.width = c.height = px;
    const ctx = c.getContext("2d")!;
    const r = LOUPE / 2 / (fit.scale * LOUPE_ZOOM);
    const p = quad[dragging];
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, px, px);
    ctx.drawImage(photo, p.x - r, p.y - r, r * 2, r * 2, 0, 0, px, px);
    // The page's edges near this corner.
    const toLoupe = (q: Point) => ({ x: ((q.x - p.x) / r + 1) * (px / 2), y: ((q.y - p.y) / r + 1) * (px / 2) });
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    const before = toLoupe(quad[(dragging + 3) % 4]);
    const at = toLoupe(p);
    const after = toLoupe(quad[(dragging + 1) % 4]);
    ctx.moveTo(before.x, before.y);
    ctx.lineTo(at.x, at.y);
    ctx.lineTo(after.x, after.y);
    ctx.stroke();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(px / 2 - 10 * dpr, px / 2);
    ctx.lineTo(px / 2 + 10 * dpr, px / 2);
    ctx.moveTo(px / 2, px / 2 - 10 * dpr);
    ctx.lineTo(px / 2, px / 2 + 10 * dpr);
    ctx.stroke();
  }, [dragging, quad, photo, fit]);

  function toPhoto(e: React.PointerEvent): Point {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - fit!.ox) / fit!.scale, y: (e.clientY - r.top - fit!.oy) / fit!.scale };
  }

  function down(e: React.PointerEvent, index: number) {
    if (!fit) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = toPhoto(e);
    grab.current = { index, dx: quad[index].x - p.x, dy: quad[index].y - p.y };
    setDragging(index);
  }

  function move(e: React.PointerEvent) {
    const g = grab.current;
    if (!g || !fit) return;
    const p = toPhoto(e);
    const x = Math.min(photo.width, Math.max(0, p.x + g.dx));
    const y = Math.min(photo.height, Math.max(0, p.y + g.dy));
    setQuad((q) => q.map((c, i) => (i === g.index ? { x, y } : c)) as Quad);
  }

  function up() {
    grab.current = null;
    setDragging(null);
  }

  const valid = isConvexQuad(quad);
  const pts = quad.map(screen);
  const loupeAt =
    dragging !== null && stage
      ? (() => {
          const p = pts[dragging];
          const left = Math.min(stage.w - LOUPE - 8, Math.max(8, p.x - LOUPE / 2));
          const above = p.y - LOUPE - 56;
          return { left, top: above >= 8 ? above : Math.min(stage.h - LOUPE - 8, p.y + 56) };
        })()
      : null;

  return (
    <>
      <div style={barStyle}>
        <ScanButton onClick={onBack}>{backLabel}</ScanButton>
        {onAsIs ? (
          <ScanButton onClick={onAsIs}>Upload as is</ScanButton>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 600, color: valid ? MUTED : "#F87171", textAlign: "right" }}>
            {valid ? "Drag the corners to fit the page" : "The corners are crossed — drag them back"}
          </span>
        )}
      </div>

      <div ref={stageRef} style={{ position: "relative", flex: 1, minHeight: 0, touchAction: "none" }}>
        {fit && (
          <>
            <canvas
              ref={shownRef}
              style={{ position: "absolute", left: fit.ox, top: fit.oy, width: fit.dw, height: fit.dh }}
            />
            <svg
              width={stage!.w}
              height={stage!.h}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              style={{ position: "absolute", inset: 0, touchAction: "none" }}
            >
              <path
                d={`M${fit.ox} ${fit.oy}h${fit.dw}v${fit.dh}h${-fit.dw}Z M${pts.map((p) => `${p.x} ${p.y}`).join(" L")}Z`}
                fill="rgba(0,0,0,.5)"
                fillRule="evenodd"
              />
              <polygon
                points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={valid ? ACCENT : "#F87171"}
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {pts.map((p, i) => (
                <g key={i}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={dragging === i ? 14 : 11}
                    fill="rgba(255,209,0,.25)"
                    stroke={ACCENT}
                    strokeWidth={3}
                    pointerEvents="none"
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={26}
                    fill="transparent"
                    role="slider"
                    aria-label={["Top-left corner", "Top-right corner", "Bottom-right corner", "Bottom-left corner"][i]}
                    aria-valuetext={`${Math.round(quad[i].x)}, ${Math.round(quad[i].y)}`}
                    style={{ cursor: dragging === i ? "grabbing" : "grab" }}
                    onPointerDown={(e) => down(e, i)}
                  />
                </g>
              ))}
            </svg>
            {loupeAt && (
              <canvas
                ref={loupeRef}
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: loupeAt.left,
                  top: loupeAt.top,
                  width: LOUPE,
                  height: LOUPE,
                  borderRadius: "50%",
                  border: `2px solid ${ACCENT}`,
                  boxShadow: "0 6px 20px rgba(0,0,0,.5)",
                  pointerEvents: "none",
                }}
              />
            )}
          </>
        )}
      </div>

      <div style={{ ...barStyle, justifyContent: "flex-end", paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
        <ScanButton onClick={() => setQuad(fullFrame(photo.width, photo.height))}>Whole photo</ScanButton>
        <ScanButton primary disabled={!valid} onClick={() => onKeep(quad)}>
          Keep scan
        </ScanButton>
      </div>
    </>
  );
}

// ─── The scanner ────────────────────────────────────────────────

// Storage can be off (private browsing), so Auto just falls back to on.
function readAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) !== "off";
  } catch {
    return true;
  }
}

function saveAuto(on: boolean) {
  try {
    localStorage.setItem(AUTO_KEY, on ? "on" : "off");
  } catch {
    // Not remembered; it still applies until the scanner closes.
  }
}

type Step =
  | { kind: "opening" }
  | { kind: "camera" }
  // `original` is the file from Upload scan, when the photo came from there.
  | { kind: "corners"; photo: HTMLCanvasElement; quad: Quad; original?: File }
  | { kind: "review" };

export function DocumentScanner({
  fileName,
  maxBytes,
  onDone,
  onCancel,
  photo,
  onPhotoUnreadable,
}: {
  // What the finished PDF is called, e.g. "Handbook signature - Wiley Fisher.pdf".
  fileName: string;
  maxBytes: number;
  // The finished PDF, or with "Upload as is", the photo it started from.
  onDone: (file: File) => void;
  onCancel: () => void;
  // Start from this photo (picked with Upload scan) instead of the camera.
  photo?: File;
  // This browser can't open `photo` (an iPhone HEIC photo in Chrome, say).
  onPhotoUnreadable?: (file: File) => void;
}) {
  const [step, setStep] = useState<Step>(photo ? { kind: "opening" } : { kind: "camera" });
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [filter, setFilter] = useState<ScanFilter>("color");
  const [auto, setAuto] = useState(readAuto);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(1);
  const pagesRef = useRef(pages);
  const closeRef = useRef<() => void>(() => {});
  useEffect(() => {
    pagesRef.current = pages;
    closeRef.current = close;
  });

  // Keep the page behind still, let Escape close, and let go of the
  // previews when closed.
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
      pagesRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, []);

  function close() {
    if (working) return;
    if (pages.length > 0 && !confirm("Discard the scanned pages?")) return;
    onCancel();
  }

  function gotPhoto(photo: HTMLCanvasElement, seen: Quad | null, original?: File) {
    const quad =
      lookForPage(photo, photo.width, photo.height, PHOTO_DETECT_SIDE)?.quad ?? seen ?? fullFrame(photo.width, photo.height);
    setStep({ kind: "corners", photo, quad, original });
  }

  // Open the photo from Upload scan, once. One this browser can't read goes
  // back to be uploaded as it is.
  useEffect(() => {
    if (!photo) return;
    let cancelled = false;
    photoFromFile(photo).then(
      (c) => {
        if (cancelled) release(c);
        else gotPhoto(c, null, photo);
      },
      () => {
        if (!cancelled) onPhotoUnreadable?.(photo);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [photo]); // eslint-disable-line react-hooks/exhaustive-deps

  async function keep(photo: HTMLCanvasElement, quad: Quad) {
    setWorking("Straightening the page…");
    setError(null);
    await nextPaint();
    try {
      const src = photo.getContext("2d")!.getImageData(0, 0, photo.width, photo.height);
      const { width, height } = outputSize(quad, PAGE_MAX_SIDE, pageAspect(quad, photo.width, photo.height));
      const flat = warpPerspective(src, quad, width, height);
      // Fingerprinted the way the live camera sees pages, to compare with it.
      const small = shrink(photo, photo.width, photo.height, LIVE_DETECT_SIDE)!;
      const s = small.width / photo.width;
      const print = pageFingerprint(small, quad.map((p) => ({ x: p.x * s, y: p.y * s })) as Quad);
      const jpeg = await withLook(flat, filter);
      setPages((ps) => [...ps, { id: nextId.current++, flat, jpeg, url: URL.createObjectURL(jpeg), print }]);
      setStep({ kind: "review" });
    } catch {
      setError("Couldn't straighten that one. Try again.");
      setStep({ kind: "camera" });
    } finally {
      // Only once the corner screen is on its way out, since it draws the photo.
      release(photo);
      setWorking(null);
    }
  }

  async function changeLook(next: ScanFilter) {
    if (next === filter || working) return;
    setFilter(next);
    setWorking("Cleaning up…");
    setError(null);
    await nextPaint();
    try {
      const redone: ScanPage[] = [];
      for (const p of pages) {
        const jpeg = await withLook(p.flat, next);
        redone.push({ ...p, jpeg, url: URL.createObjectURL(jpeg) });
      }
      pages.forEach((p) => URL.revokeObjectURL(p.url));
      setPages(redone);
    } catch {
      setError("Couldn't change the look. Try again.");
    } finally {
      setWorking(null);
    }
  }

  function removePage(id: number) {
    const gone = pages.find((p) => p.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    const rest = pages.filter((p) => p.id !== id);
    setPages(rest);
    if (rest.length === 0) setStep({ kind: "camera" });
  }

  async function attach() {
    setWorking("Saving the PDF…");
    setError(null);
    try {
      const jpegs = await Promise.all(pages.map(async (p) => new Uint8Array(await p.jpeg.arrayBuffer())));
      const pdf = buildPdf(jpegs);
      if (pdf.length > maxBytes) {
        setError(
          `That's over ${Math.round(maxBytes / 1024 / 1024)} MB. Try fewer pages, or ${SCAN_FILTERS.find((f) => f.key === "bw")!.label}.`
        );
        return;
      }
      onDone(new File([pdf], fileName, { type: "application/pdf" }));
    } catch {
      setError("Couldn't save the scan. Try again.");
    } finally {
      setWorking(null);
    }
  }

  const count = `${pages.length} ${pages.length === 1 ? "page" : "pages"}`;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan with camera"
      style={{
        position: "fixed",
        inset: 0,
        // Above the guided tour's callouts (1500), which pick up again after.
        zIndex: 1600,
        background: "#0B0B0C",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        paddingTop: "env(safe-area-inset-top)",
        overscrollBehavior: "contain",
      }}
    >
      {step.kind === "opening" && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: MUTED, fontSize: 14, fontWeight: 600 }}>
          Opening the photo…
        </div>
      )}

      {step.kind === "camera" && (
        <CameraView
          backLabel={pages.length ? "Back" : "Cancel"}
          onBack={pages.length ? () => setStep({ kind: "review" }) : close}
          onPhoto={gotPhoto}
          auto={auto}
          onAutoChange={(on) => {
            setAuto(on);
            saveAuto(on);
          }}
          lastPrint={pages[pages.length - 1]?.print ?? null}
        />
      )}

      {step.kind === "corners" && (
        <CornerEditor
          photo={step.photo}
          initial={step.quad}
          // A photo from Upload scan (always the first page) has nothing to
          // retake: Cancel backs out of the scanner.
          backLabel={step.original ? "Cancel" : "Retake"}
          onBack={() => {
            release(step.photo);
            if (step.original) onCancel();
            else setStep({ kind: "camera" });
          }}
          onAsIs={
            step.original
              ? () => {
                  release(step.photo);
                  onDone(step.original!);
                }
              : undefined
          }
          onKeep={(quad) => keep(step.photo, quad)}
        />
      )}

      {step.kind === "review" && (
        <>
          <div style={barStyle}>
            <ScanButton onClick={close} disabled={!!working}>
              Cancel
            </ScanButton>
            <span style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>{count}</span>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              display: "flex",
              flexDirection: pages.length > 1 ? "row" : "column",
              alignItems: "center",
              justifyContent: pages.length > 1 ? "flex-start" : "center",
              gap: 16,
              padding: "8px 16px",
              overflowX: pages.length > 1 ? "auto" : "hidden",
              scrollSnapType: pages.length > 1 ? "x mandatory" : undefined,
            }}
          >
            {pages.map((p, i) => (
              <figure
                key={p.id}
                style={{
                  margin: 0,
                  flex: pages.length > 1 ? "0 0 82%" : undefined,
                  width: pages.length > 1 ? undefined : "100%",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  scrollSnapAlign: "center",
                  minHeight: 0,
                }}
              >
                <div style={{ position: "relative", flex: 1, minHeight: 0, width: "100%" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local blob preview */}
                  <img
                    src={p.url}
                    alt={`Page ${i + 1} of the scan`}
                    style={{
                      position: "absolute",
                      inset: 0,
                      margin: "auto",
                      maxWidth: "100%",
                      maxHeight: "100%",
                      borderRadius: 4,
                      boxShadow: "0 4px 18px rgba(0,0,0,.5)",
                    }}
                  />
                </div>
                <figcaption style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, fontWeight: 600, color: MUTED }}>
                  Page {i + 1}
                  <button
                    type="button"
                    onClick={() => removePage(p.id)}
                    disabled={!!working}
                    aria-label={`Delete page ${i + 1}`}
                    style={{ border: "none", background: "transparent", color: MUTED, padding: 4, display: "inline-flex", cursor: "pointer" }}
                  >
                    <Icons.Trash width={16} height={16} />
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "8px 16px", paddingBottom: "calc(16px + env(safe-area-inset-bottom))", flexShrink: 0 }}>
            <div
              role="radiogroup"
              aria-label="Look"
              style={{ display: "flex", gap: 2, padding: 3, borderRadius: 10, background: "rgba(255,255,255,.1)", alignSelf: "center" }}
            >
              {SCAN_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="radio"
                  aria-checked={filter === f.key}
                  onClick={() => changeLook(f.key)}
                  disabled={!!working}
                  style={{
                    height: 32,
                    padding: "0 14px",
                    borderRadius: 8,
                    border: "none",
                    background: filter === f.key ? "#fff" : "transparent",
                    color: filter === f.key ? ACCENT_ON : "#fff",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {error && (
              <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: "#F87171", textAlign: "center" }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
              <ScanButton onClick={() => setStep({ kind: "camera" })} disabled={!!working || pages.length >= SCAN_MAX_PAGES}>
                <Icons.Plus width={16} height={16} />
                Add page
              </ScanButton>
              <ScanButton primary onClick={attach} disabled={!!working || pages.length === 0}>
                Attach scan
              </ScanButton>
            </div>
          </div>
        </>
      )}

      {step.kind !== "review" && error && (
        <div role="alert" style={{ position: "absolute", left: 16, right: 16, top: "calc(64px + env(safe-area-inset-top))", fontSize: 13, fontWeight: 600, color: "#F87171", textAlign: "center" }}>
          {error}
        </div>
      )}

      {working && (
        <div
          aria-live="polite"
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(11,11,12,.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          {working}
        </div>
      )}
    </div>,
    document.body
  );
}
