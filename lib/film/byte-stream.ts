// One open read of a film file from a byte offset, handed out in pieces.
//
// Supabase Storage answers a Range request for a spot deep in a big file it
// hasn't read lately only after reading up to that spot: 1 MB at 600 MB in
// took 50 s, and 2 GB+ in ran past Node's 5-minute body timeout
// ("terminated"). Asking for every 8 MiB piece separately paid that wait per
// piece. Now each worker run opens one stream at its offset, waits once, and
// reads the rest in order. The body timeout is off; the run's own deadline
// decides when to stop.

import { Agent, request } from "undici";
import { FilmStorageError } from "./object.ts";

const agent = new Agent({ bodyTimeout: 0, headersTimeout: 120_000 });

export type ReadResult = { bytes: Buffer } | { timedOut: true } | { ended: true };

// Pieces out of an async byte source. read() waits for exactly `size` bytes
// (fewer only at the end of the file), or gives up at the deadline.
export class ByteReader {
  private parts: Buffer[] = [];
  private buffered = 0;
  private ended = false;
  private pending: Promise<IteratorResult<Uint8Array>> | null = null;

  private readonly source: AsyncIterator<Uint8Array>;
  private readonly onClose: () => void;
  position: number;

  constructor(source: AsyncIterator<Uint8Array>, position: number, onClose: () => void = () => {}) {
    this.source = source;
    this.position = position;
    this.onClose = onClose;
  }

  async read(size: number, deadline: number): Promise<ReadResult> {
    while (this.buffered < size && !this.ended) {
      const wait = deadline - Date.now();
      if (wait <= 0) return { timedOut: true };
      this.pending ??= this.source.next();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), wait);
      });
      const next = await Promise.race([this.pending, timeout]);
      clearTimeout(timer);
      if (next === "timeout") return { timedOut: true };
      this.pending = null;
      if (next.done) {
        this.ended = true;
        break;
      }
      const chunk = Buffer.from(next.value);
      this.parts.push(chunk);
      this.buffered += chunk.length;
    }
    if (this.buffered === 0) return { ended: true };
    const all = this.parts.length === 1 ? this.parts[0] : Buffer.concat(this.parts);
    const take = Math.min(size, all.length);
    const bytes = all.subarray(0, take);
    const rest = all.subarray(take);
    this.parts = rest.length > 0 ? [rest] : [];
    this.buffered = rest.length;
    this.position += take;
    return { bytes };
  }

  // The reader is done with; whatever is in flight is dropped.
  close(): void {
    this.pending?.catch(() => {});
    this.pending = null;
    this.parts = [];
    this.buffered = 0;
    this.ended = true;
    this.onClose();
  }
}

export async function openFilmByteStream(url: string, start: number): Promise<ByteReader> {
  const res = await request(url, {
    method: "GET",
    headers: { range: `bytes=${start}-` },
    dispatcher: agent,
  });
  if (res.statusCode === 404 || res.statusCode === 400) {
    await res.body.dump().catch(() => {});
    throw new FilmStorageError("Object not found", "missing");
  }
  if (res.statusCode !== 206 && !(res.statusCode === 200 && start === 0)) {
    await res.body.dump().catch(() => {});
    throw new Error(`Couldn't read film bytes (${res.statusCode}).`);
  }
  const body = res.body;
  body.on("error", () => {});
  return new ByteReader(body[Symbol.asyncIterator](), start, () => body.destroy());
}
