// The live page's printable signs (0165) as one PDF: a poster, a table tent
// for the admission tables, four cards to a sheet, and a card for each
// court's scorer's table. Every page is exactly Letter, edge to edge, so
// printing never depends on the browser's print engine (Safari's printed
// the old HTML signs blank). The PIN is never printed.

import { PDFDocument, BlendMode, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";

export interface SignsInput {
  event: string;
  dateLine: string;
  place: string;
  admission: string | null;
  courts: number;
  liveUrl: string; // https://omahalightningbasketball.com/shootout
}

export interface SignsAssets {
  display: Uint8Array; // Barlow Condensed ExtraBold
  regular: Uint8Array; // Barlow Regular
  semibold: Uint8Array; // Barlow SemiBold
  bold: Uint8Array; // Barlow Bold
  bolt: Uint8Array; // the bolt logo, PNG on white
}

const IN = 72;
const PX = 0.75; // the HTML signs' CSS px, in points
const W = 8.5 * IN;
const H = 11 * IN;
const INK = rgb(0x12 / 255, 0x14 / 255, 0x17 / 255);
const GOLD = rgb(0xf5 / 255, 0xc5 / 255, 0x18 / 255);
const WHITE = rgb(1, 1, 1);
const MUTED = rgb(0x55 / 255, 0x55 / 255, 0x55 / 255);
const GREY = rgb(0x66 / 255, 0x66 / 255, 0x66 / 255);
const DASH = rgb(0xaa / 255, 0xaa / 255, 0xaa / 255);

type Fonts = { display: PDFFont; regular: PDFFont; semibold: PDFFont; bold: PDFFont };

export async function buildSignsPdf(input: SignsInput, assets: SignsAssets): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Signs — ${input.event}`);
  doc.setCreator("Omaha Lightning Basketball");
  const f: Fonts = {
    display: await doc.embedFont(assets.display, { subset: true }),
    regular: await doc.embedFont(assets.regular, { subset: true }),
    semibold: await doc.embedFont(assets.semibold, { subset: true }),
    bold: await doc.embedFont(assets.bold, { subset: true }),
  };
  const bolt = await doc.embedPng(assets.bolt);
  const live = input.liveUrl;
  const liveShort = live.replace(/^https?:\/\//, "");

  poster(doc.addPage([W, H]), f, bolt, input, live, liveShort);
  tent(doc.addPage([H, W]), f, bolt, input, live);
  cards(doc.addPage([H, W]), f, bolt, input, live, liveShort);
  for (let c = 1; c <= input.courts; c += 2) {
    courtsPage(doc.addPage([W, H]), f, [c, c + 1].filter((n) => n <= input.courts), live);
  }
  return doc.save();
}

// ─── Pages ──────────────────────────────────────────────────────────────────

function poster(page: PDFPage, f: Fonts, bolt: PDFImage, input: SignsInput, live: string, liveShort: string) {
  const d = new Draw(page);
  const stripe = 0.35 * IN;
  d.rect(0, 0, W, stripe, GOLD);
  d.rect(0, H - stripe, W, stripe, GOLD);

  // The black band: the tournament and its dates.
  const evSize = 64 * PX;
  const evLines = wrap(input.event.toUpperCase(), f.display, evSize, W - 1 * IN);
  const dt = [input.dateLine, input.place].filter(Boolean).join(" · ").toUpperCase();
  const bandH = 0.45 * IN + evLines.length * evSize * 0.92 + 14 * PX + 15 * PX + 0.4 * IN;
  d.rect(0, stripe, W, bandH, INK);
  let y = stripe + 0.45 * IN;
  for (const line of evLines) {
    d.textCenter(line, W / 2, y, f.display, evSize, WHITE);
    y += evSize * 0.92;
  }
  d.spacedCenter(dt, W / 2, y + 14 * PX, f.bold, 15 * PX, 0.16 * 15 * PX, GOLD);

  // The footer: admission prices, when Details has them.
  const footSize = 14 * PX;
  const footLines = input.admission ? wrapBlock(input.admission, f.regular, footSize, W - 1.1 * IN) : [];
  const footH = footLines.length ? 0.18 * IN + 12 * PX * 1.4 + footLines.length * footSize * 1.35 + 0.26 * IN : 0;
  const footTop = H - stripe - footH;
  if (footLines.length) {
    d.rect(0.55 * IN, footTop, W - 1.1 * IN, 3 * PX, INK);
    let fy = footTop + 0.18 * IN;
    d.spaced("ADMISSION", 0.55 * IN, fy, f.bold, 12 * PX, 0.12 * 12 * PX, INK);
    fy += 12 * PX * 1.4;
    for (const line of footLines) {
      d.text(line, 0.55 * IN, fy, f.regular, footSize, INK);
      fy += footSize * 1.35;
    }
  }

  // The middle: the headline, the QR code and its address.
  const bigSize = 60 * PX;
  const qr = 4.3 * IN;
  const gap = 0.22 * IN;
  const midH = bigSize * 0.92 * 2 + gap + qr + gap + 18 * PX * 1.2 + 4 * PX + 14 * PX * 1.2;
  const midTop = stripe + bandH;
  let my = midTop + (footTop - midTop - midH) / 2;
  d.textCenter("LIVE SCORES", W / 2, my, f.display, bigSize, INK);
  d.textCenter("& BRACKETS", W / 2, my + bigSize * 0.92, f.display, bigSize, INK);
  my += bigSize * 0.92 * 2 + gap;
  d.qr(live, (W - qr) / 2, my, qr, bolt);
  my += qr + gap;
  d.textCenter(liveShort, W / 2, my, f.bold, 18 * PX, INK);
  d.textCenter("Point your phone camera at the code", W / 2, my + 18 * PX * 1.2 + 4 * PX, f.regular, 14 * PX, MUTED);
}

// Landscape, folded across the middle: the top half is upside down so it
// reads from the other side of the table.
function tent(page: PDFPage, f: Fonts, bolt: PDFImage, input: SignsInput, live: string) {
  const PW = H;
  const PH = W;
  const half = PH / 2;
  const d = new Draw(page, PW, PH);
  const drawHalf = (top: number, tag: string, l1: string, l2: string, small: string | null) => {
    const padX = 0.6 * IN;
    const qr = 2.7 * IN;
    const qx = PW - padX - qr;
    d.qr(live, qx, top + (half - qr) / 2, qr, bolt);
    const textW = qx - 0.4 * IN - padX;
    const big = 54 * PX;
    const smallLines = small ? wrapBlock(small, f.regular, 15 * PX, Math.min(textW, 4.6 * IN)) : [];
    const blockH = 13 * PX * 1.6 + 10 * PX + big * 0.92 * 2 + (smallLines.length ? 20 * PX + smallLines.length * 15 * PX * 1.3 : 0);
    let y = top + (half - blockH) / 2;
    d.tag(tag.toUpperCase(), padX, y, f.bold, 13 * PX);
    y += 13 * PX * 1.6 + 10 * PX;
    d.text(l1, padX, y, f.display, big, INK);
    d.text(l2, padX, y + big * 0.92, f.display, big, INK);
    y += big * 0.92 * 2 + 20 * PX;
    for (const line of smallLines) {
      d.text(line, padX, y, f.regular, 15 * PX, INK);
      y += 15 * PX * 1.3;
    }
  };
  // The upside-down half: drawn in the lower half, then turned 180° about
  // the page's centre so it lands on top.
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(-1, 0, 0, -1, PW, PH));
  drawHalf(half, input.event, "SCORES, BRACKETS", "& SCHEDULE", null);
  page.pushOperators(popGraphicsState());
  drawHalf(half, input.admission ? "Admission" : input.event, "SCAN FOR LIVE", "SCORES", input.admission);
  d.dashedH(0, PW, half, DASH);
}

function cards(page: PDFPage, f: Fonts, bolt: PDFImage, input: SignsInput, live: string, liveShort: string) {
  const PW = H;
  const PH = W;
  const d = new Draw(page, PW, PH);
  const cw = PW / 2;
  const ch = PH / 2;
  const titles = ["Live scores & brackets", "Who's playing next?", "Live scores & brackets", "Who's playing next?"];
  titles.forEach((t, i) => {
    const x = (i % 2) * cw;
    const y = Math.floor(i / 2) * ch;
    const pad = 0.35 * IN;
    const qr = 2.1 * IN;
    d.qr(live, x + pad, y + (ch - qr) / 2, qr, bolt, true);
    const tx = x + pad + qr + 0.3 * IN;
    const tw = x + cw - pad - tx;
    const big = 32 * PX;
    const lines = wrap(t.toUpperCase(), f.display, big, tw);
    const tiny = wrap(`${input.event} · ${liveShort}`, f.regular, 12 * PX, tw);
    const blockH = 6 * PX + 10 * PX + lines.length * big * 0.92 + 8 * PX + tiny.length * 12 * PX * 1.3;
    let ty = y + (ch - blockH) / 2;
    d.rect(tx, ty, 44 * PX, 6 * PX, GOLD);
    ty += 16 * PX;
    for (const line of lines) {
      d.text(line, tx, ty, f.display, big, INK);
      ty += big * 0.92;
    }
    ty += 8 * PX;
    for (const line of tiny) {
      d.text(line, tx, ty, f.regular, 12 * PX, rgb(0x44 / 255, 0x44 / 255, 0x44 / 255));
      ty += 12 * PX * 1.3;
    }
  });
  // Cut lines.
  d.dashedH(0, PW, ch, DASH);
  d.dashedV(cw, 0, PH, DASH);
}

// Two court cards to a portrait page; cut across the middle.
function courtsPage(page: PDFPage, f: Fonts, courts: number[], live: string) {
  const d = new Draw(page);
  const half = H / 2;
  courts.forEach((c, i) => {
    const top = i * half;
    const border = 14 * PX;
    d.rect(0, top, W, border, GOLD);
    if (i > 0) d.rect(0, top - 0.75, W, 0.75, rgb(0xbb / 255, 0xbb / 255, 0xbb / 255));
    const padX = 0.6 * IN;
    const qr = 2.7 * IN;
    const body = half - border;
    d.qr(`${live}/score?court=${c}`, padX, top + border + (body - qr) / 2, qr, null);
    const tx = padX + qr + 0.45 * IN;
    const steps = ["Scan after the final horn", "First time: type the PIN from the tournament desk", "Type both scores, press Save final"];
    const stepSize = 17 * PX;
    const tw = W - padX - tx;
    const stepLines = steps.map((s) => wrap(s, f.regular, stepSize, tw - 16));
    const blockH = 13 * PX * 1.4 + 8 + 96 * PX * 0.92 + 20 * PX + stepLines.flat().length * stepSize * 1.5;
    let y = top + border + (body - blockH) / 2;
    d.spaced("SCORER'S TABLE · NOT FOR FANS", tx, y, f.bold, 13 * PX, 0.14 * 13 * PX, GREY);
    y += 13 * PX * 1.4 + 8;
    d.text(`COURT ${c}`, tx, y, f.display, 96 * PX, INK);
    y += 96 * PX * 0.92 + 20 * PX;
    stepLines.forEach((lines, n) => {
      d.text(`${n + 1}.`, tx, y, f.regular, stepSize, INK);
      for (const line of lines) {
        d.text(line, tx + 16, y, f.regular, stepSize, INK);
        y += stepSize * 1.5;
      }
    });
  });
}

// ─── Drawing, with y measured from the top like the HTML signs ─────────────

class Draw {
  private page: PDFPage;
  private ph: number;
  constructor(page: PDFPage, _pw = W, ph = H) {
    this.page = page;
    this.ph = ph;
  }

  rect(x: number, top: number, w: number, h: number, color: ReturnType<typeof rgb>) {
    this.page.drawRectangle({ x, y: this.ph - top - h, width: w, height: h, color });
  }

  // `top` is the top of the line box; the baseline sits a cap height below.
  text(s: string, x: number, top: number, font: PDFFont, size: number, color: ReturnType<typeof rgb>) {
    this.page.drawText(s, { x, y: this.ph - top - font.heightAtSize(size, { descender: false }), size, font, color });
  }

  textCenter(s: string, cx: number, top: number, font: PDFFont, size: number, color: ReturnType<typeof rgb>) {
    this.text(s, cx - font.widthOfTextAtSize(s, size) / 2, top, font, size, color);
  }

  spaced(s: string, x: number, top: number, font: PDFFont, size: number, spacing: number, color: ReturnType<typeof rgb>) {
    let cx = x;
    for (const ch of s) {
      this.text(ch, cx, top, font, size, color);
      cx += font.widthOfTextAtSize(ch, size) + spacing;
    }
  }

  spacedCenter(s: string, cx: number, top: number, font: PDFFont, size: number, spacing: number, color: ReturnType<typeof rgb>) {
    const w = [...s].reduce((n, ch) => n + font.widthOfTextAtSize(ch, size) + spacing, 0) - spacing;
    this.spaced(s, cx - w / 2, top, font, size, spacing, color);
  }

  tag(s: string, x: number, top: number, font: PDFFont, size: number) {
    const spacing = 0.14 * size;
    const w = [...s].reduce((n, ch) => n + font.widthOfTextAtSize(ch, size) + spacing, 0) - spacing;
    const padX = 10 * PX;
    const h = size * 1.6;
    this.rect(x, top, w + padX * 2, h, GOLD);
    this.spaced(s, x + padX, top + (h - font.heightAtSize(size, { descender: false })) / 2, font, size, spacing, INK);
  }

  dashedH(x1: number, x2: number, top: number, color: ReturnType<typeof rgb>) {
    const y = this.ph - top;
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.75, color, dashArray: [4, 3] });
  }

  dashedV(x: number, top1: number, top2: number, color: ReturnType<typeof rgb>) {
    this.page.drawLine({ start: { x, y: this.ph - top1 }, end: { x, y: this.ph - top2 }, thickness: 0.75, color, dashArray: [4, 3] });
  }

  // A QR code in its rounded black frame, with the gold bolt badge in the
  // middle (error correction H keeps it scannable under the badge).
  qr(text: string, x: number, top: number, size: number, bolt: PDFImage | null, small = false) {
    const border = (small ? 3 : 4) * PX;
    const pad = (small ? 6 : 10) * PX;
    const radius = 14 * PX;
    const y = this.ph - top - size;
    this.page.drawSvgPath(roundedRect(size, size, radius), { x, y: y + size, color: INK });
    this.page.drawSvgPath(roundedRect(size - border * 2, size - border * 2, Math.max(0, radius - border)), {
      x: x + border,
      y: y + size - border,
      color: WHITE,
    });
    const code = QRCode.create(text, { errorCorrectionLevel: "H" });
    const n = code.modules.size;
    const inner = size - (border + pad) * 2;
    const m = inner / n;
    const ox = x + border + pad;
    // One path for every dark module, so neighbouring modules print as one
    // solid shape with no hairline seams between them.
    let path = "";
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!code.modules.get(r, c)) {
          c++;
          continue;
        }
        let run = 1;
        while (c + run < n && code.modules.get(r, c + run)) run++;
        path += `M${(c * m).toFixed(3)} ${(r * m).toFixed(3)}h${(run * m).toFixed(3)}v${m.toFixed(3)}h${(-run * m).toFixed(3)}Z`;
        c += run;
      }
    }
    this.page.drawSvgPath(path, { x: ox, y: y + size - border - pad, color: INK });
    if (!bolt) return;
    const d = size * 0.22;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const ring = (small ? 3 : 4) * PX;
    this.page.drawCircle({ x: cx, y: cy, size: d / 2, color: WHITE });
    this.page.drawCircle({ x: cx, y: cy, size: d / 2 - ring, color: GOLD });
    // The logo is black on white; multiply drops the white onto the gold,
    // as the screen version does.
    const lw = (d - ring * 2) * 0.78;
    const lh = (lw * bolt.height) / bolt.width;
    this.page.drawImage(bolt, { x: cx - lw / 2, y: cy - lh / 2, width: lw, height: lh, blendMode: BlendMode.Multiply });
  }
}

function roundedRect(w: number, h: number, r: number): string {
  // SVG coordinates: y grows down from the path's origin.
  return `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
}

// ─── Text wrapping ──────────────────────────────────────────────────────────

export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

// Keeps the author's line breaks (Details' admission text), wrapping each.
function wrapBlock(text: string, font: PDFFont, size: number, width: number): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((l) => wrap(l, font, size, width));
}


// "Nov 13–14, 2026"
export function signsDatesLabel(a: string, b: string): string {
  const f = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...o });
  if (a === b) return f(a, { month: "short", day: "numeric", year: "numeric" });
  const sameMonth = a.slice(0, 7) === b.slice(0, 7);
  return `${f(a, { month: "short", day: "numeric" })}–${sameMonth ? f(b, { day: "numeric" }) : f(b, { month: "short", day: "numeric" })}, ${b.slice(0, 4)}`;
}
