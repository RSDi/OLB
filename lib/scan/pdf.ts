// Bundles scanned pages (JPEGs) into one PDF, a page per scan, so a
// multi-page scan saves as a single file. The JPEGs go in as they are (PDF
// reads them natively), so this is just the file's bookkeeping. Pure and
// safe to import from client components.

// The pixel size and colour channels a JPEG says it has (its frame header).
export function jpegInfo(bytes: Uint8Array): { width: number; height: number; components: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    // Padding, and markers that carry no length.
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2;
      continue;
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    // Any start-of-frame except the DHT (C4), JPG (C8) and DAC (CC) markers.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: (bytes[i + 5] << 8) | bytes[i + 6],
        width: (bytes[i + 7] << 8) | bytes[i + 8],
        components: bytes[i + 9],
      };
    }
    i += 2 + len;
  }
  return null;
}

// Pages come out 8½ inches across (a letter page's width), each as tall as
// its scan's shape makes it; a scan wider than tall is 8½ inches high instead.
const SHORT_SIDE_PT = 612;

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function buildPdf(jpegs: Uint8Array[]): Uint8Array<ArrayBuffer> {
  if (jpegs.length === 0) throw new Error("No pages to save.");
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const put = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? enc.encode(part) : part;
    chunks.push(bytes);
    size += bytes.length;
  };
  const object = (id: number, ...parts: (string | Uint8Array)[]) => {
    offsets[id] = size;
    put(`${id} 0 obj\n`);
    for (const p of parts) put(p);
    put("\nendobj\n");
  };

  // The binary comment tells tools the file isn't plain text.
  put("%PDF-1.4\n");
  put(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  // Objects: 1 catalog, 2 page list, then page, contents and image per page.
  const pageIds = jpegs.map((_, i) => 3 + i * 3);
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${jpegs.length} >>`);
  jpegs.forEach((jpeg, i) => {
    const info = jpegInfo(jpeg);
    if (!info) throw new Error(`Page ${i + 1} isn't a JPEG.`);
    const scale = SHORT_SIDE_PT / Math.min(info.width, info.height);
    const w = fmt(info.width * scale);
    const h = fmt(info.height * scale);
    const id = pageIds[i];
    const draw = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    object(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`
    );
    object(id + 1, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
    object(
      id + 2,
      `<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace ${
        info.components === 1 ? "/DeviceGray" : info.components === 4 ? "/DeviceCMYK" : "/DeviceRGB"
      } /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      jpeg,
      "\nendstream"
    );
  });

  const count = 3 + jpegs.length * 3;
  const xref = size;
  put(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) put(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  put(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
