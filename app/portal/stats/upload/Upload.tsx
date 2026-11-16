"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "../../../../lib/supabase/client";
import { readBook, startBook } from "../../../../lib/stats/actions";
import { PHOTO_MAX_PX, SCOREBOOK_BUCKET, type StatsTeam } from "../../../../lib/stats/types";
import s from "../stats.module.css";

type Status =
  | { kind: "waiting" }
  | { kind: "uploading" }
  | { kind: "reading" }
  | { kind: "done"; gameId: string }
  | { kind: "failed"; message: string; bookId?: string; gameId?: string };

interface Item {
  key: string;
  name: string;
  preview: string;
  file: File;
  status: Status;
}

// Any photo the browser can open (iPhone photos arrive as JPEG; Safari also
// opens HEIC) becomes a JPEG no bigger than PHOTO_MAX_PX on the long side.
async function toJpeg(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This browser can't open that photo. On a Mac, open it in Preview and choose File → Export as JPEG, or upload it from your phone.");
  }
  const scale = Math.min(1, PHOTO_MAX_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!blob) throw new Error("Couldn't prepare the photo.");
  return blob;
}

export function Upload({ teams, initialTeam }: { teams: StatsTeam[]; initialTeam: string }) {
  const [team, setTeam] = useState(initialTeam);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  // A photo dropped anywhere on this page is taken as a photo to read, not
  // opened by the browser (which would leave the page).
  useEffect(() => {
    const keep = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", keep);
    window.addEventListener("drop", keep);
    return () => {
      window.removeEventListener("dragover", keep);
      window.removeEventListener("drop", keep);
    };
  }, []);

  const set = (key: string, status: Status) => setItems((all) => all.map((it) => (it.key === key ? { ...it, status } : it)));

  function add(files: FileList | null) {
    if (!files?.length) return;
    const next = [...files]
      .filter((f) => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png)$/i.test(f.name))
      .map((file) => ({
        key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        preview: URL.createObjectURL(file),
        file,
        status: { kind: "waiting" } as Status,
      }));
    setItems((all) => [...all, ...next]);
    if (input.current) input.current.value = "";
  }

  async function readOne(item: Item) {
    if (item.status.kind === "failed" && item.status.bookId) {
      const bookId = item.status.bookId;
      set(item.key, { kind: "reading" });
      const res = await readBook(bookId);
      set(item.key, res.error !== undefined ? { kind: "failed", message: res.error, bookId, gameId: item.status.gameId } : { kind: "done", gameId: res.gameId });
      return;
    }
    set(item.key, { kind: "uploading" });
    let bookId: string | undefined;
    let gameId: string | undefined;
    try {
      const jpeg = await toJpeg(item.file);
      const start = await startBook({ teamId: team });
      if (start.error !== undefined) throw new Error(start.error);
      bookId = start.bookId;
      gameId = start.gameId;
      const { error } = await createClient()
        .storage.from(SCOREBOOK_BUCKET)
        .uploadToSignedUrl(start.path, start.token, jpeg, { contentType: "image/jpeg" });
      if (error) throw new Error(`The photo didn't upload: ${error.message}`);
      set(item.key, { kind: "reading" });
      const res = await readBook(start.bookId);
      if (res.error !== undefined) throw new Error(res.error);
      set(item.key, { kind: "done", gameId: res.gameId });
    } catch (err) {
      set(item.key, { kind: "failed", message: err instanceof Error ? err.message : String(err), bookId, gameId });
    }
  }

  async function readAll() {
    setBusy(true);
    for (const it of items) {
      if (it.status.kind === "waiting" || it.status.kind === "failed") await readOne(it);
    }
    setBusy(false);
  }

  const pending = items.filter((it) => it.status.kind === "waiting" || it.status.kind === "failed").length;

  return (
    <section className={`rsd-card ${s.card}`} style={{ gap: 16 }}>
      <div>
        <h2 className={s.h2} style={{ fontSize: 20 }}>Upload scorebooks</h2>
        <p className={s.muted}>
          One photo per game: our page of the book. Add a whole day at once. We read the date, the marks and the scores off each page; you check them and add who you played.
        </p>
      </div>

      <label className={s.field} style={{ maxWidth: 320 }}>
        Team
        <select value={team} onChange={(e) => setTeam(e.target.value)} disabled={busy}>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      <label
        className={s.drop}
        style={over ? { borderColor: "var(--gw-fg)", background: "var(--gw-bg-elev)" } : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!busy) add(e.dataTransfer.files);
        }}
      >
        <input ref={input} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(e) => add(e.target.files)} disabled={busy} />
        <strong>Drop photos here, or tap to take or choose them</strong>
        <span>Whole page in the frame, shot from straight above. A shadow over the right-hand columns is fine.</span>
      </label>

      {items.length > 0 && (
        <div>
          {items.map((it) => (
            <div key={it.key} className={s.upItem}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.preview} alt="" className={s.thumb} />
              <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontWeight: 600, fontSize: 14, overflowWrap: "anywhere" }}>{it.name}</span>
                <StatusText status={it.status} />
              </div>
              {it.status.kind === "done" && (
                <Link href={`/portal/stats/games/${it.status.gameId}`} className={`${s.btn} ${s.btnAccent}`}>
                  Check it
                </Link>
              )}
              {it.status.kind === "waiting" && !busy && (
                <button type="button" className={s.btn} onClick={() => setItems((all) => all.filter((x) => x.key !== it.key))}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className={s.actions}>
        <button type="button" className={`${s.btn} ${s.btnAccent}`} disabled={busy || pending === 0 || !team} onClick={readAll}>
          {busy ? "Reading…" : pending > 1 ? `Read ${pending} books` : pending === 1 && items.some((i) => i.status.kind === "failed") ? "Try again" : "Read the book"}
        </button>
      </div>
    </section>
  );
}

function StatusText({ status }: { status: Status }) {
  switch (status.kind) {
    case "waiting":
      return <span className={s.muted}>Ready to read</span>;
    case "uploading":
      return <span className={s.muted}>Uploading…</span>;
    case "reading":
      return <span className={s.muted}>Reading the book… this takes about a minute.</span>;
    case "done":
      return <span className={s.muted}>Read. Check it before it counts.</span>;
    case "failed":
      return <span className={s.error}>{status.message}</span>;
  }
}
