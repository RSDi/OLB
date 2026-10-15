"use client";
// Settings → Import: hotel Group Rooming List → mark Booked on a hotel stay.
// Travel and the board. Upload → preview matches → apply.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "../../components/icons";
import { Pill, Select } from "../../components/ui";
import {
  applyRoomingImport,
  previewRoomingImport,
  type RoomingApplyResult,
  type RoomingPreview,
} from "../../../lib/hotel-rooming-import/actions";
import { bookingNote } from "../../../lib/hotel-rooming-import/match";
import { seasonLabel } from "../../../lib/planning/season";

const muted: React.CSSProperties = { fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.55, fontWeight: 500 };
const cap: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "var(--gw-fg-muted)",
};

export function HotelRoomingImport() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RoomingPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ stayId: string; marked: number } | null>(null);

  const [hotelId, setHotelId] = useState("");
  const [weekendId, setWeekendId] = useState("");
  const [stayId, setStayId] = useState("");
  const [stayName, setStayName] = useState("Regionals");
  // confirmation → player ids (comma-joined in select as multi via checkboxes)
  const [marks, setMarks] = useState<Record<string, string[]>>({});

  async function runPreview() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setDone(null);
    const form = new FormData();
    form.set("file", file);
    const res = await previewRoomingImport(form).catch(() => ({ error: "Couldn't reach the server. Try again." }));
    setBusy(false);
    if ("error" in res) return setError(res.error);
    setPreview(res);
    setHotelId(res.plan.hotel.pick?.id ?? "");
    setWeekendId(res.plan.weekend.pick?.id ?? "");
    setStayId(res.plan.stay.pick?.id ?? "");
    const event = res.plan.weekend.pick?.event?.trim();
    setStayName(event && event.length <= 80 ? event : "Regionals");
    const next: Record<string, string[]> = {};
    for (const g of res.plan.guests) {
      next[g.guest.confirmation] = [...g.playerIds];
    }
    setMarks(next);
  }

  const stayChoices = useMemo(() => {
    if (!preview) return [];
    return preview.plan.stay.candidates.filter(
      (s) => (!weekendId || s.weekendId === weekendId) && (!hotelId || s.hotelContactId === hotelId)
    );
  }, [preview, weekendId, hotelId]);

  const willCreate = !!preview && !stayId && !!weekendId && !!hotelId;

  async function apply() {
    if (!preview) return;
    if (!stayId && !(weekendId && hotelId)) {
      setError("Pick the hotel and the HS Schedule weekend (or an existing stay).");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await applyRoomingImport({
      stayId: stayId || null,
      createStay: willCreate
        ? {
            weekendId,
            hotelContactId: hotelId,
            name: stayName.trim() || "Hotel stay",
            bookingCode: preview.parsed.groupCode ?? "",
            bookingInstructions: preview.parsed.hotelName
              ? `Imported from ${preview.fileName} (${preview.parsed.hotelName}).`
              : `Imported from ${preview.fileName}.`,
          }
        : null,
      marks: preview.plan.guests.map((g) => ({
        confirmation: g.guest.confirmation,
        playerIds: marks[g.guest.confirmation] ?? [],
        note: bookingNote(g.guest),
      })),
      guests: preview.plan.guests.map((g) => g.guest),
    }).catch((): RoomingApplyResult => ({ error: "Couldn't reach the server. Try again." }));
    setBusy(false);
    if (res.error) return setError(res.error);
    if (res.stayId) {
      setDone({ stayId: res.stayId, marked: res.marked ?? 0 });
      router.refresh();
    }
  }

  function togglePlayer(confirmation: string, playerId: string) {
    setMarks((prev) => {
      const cur = prev[confirmation] ?? [];
      const next = cur.includes(playerId) ? cur.filter((id) => id !== playerId) : [...cur, playerId];
      return { ...prev, [confirmation]: next };
    });
  }

  const matchedCount = preview
    ? preview.plan.guests.filter((g) => (marks[g.guest.confirmation] ?? []).length > 0).length
    : 0;

  return (
    <div className="rsd-card" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }} data-tour="hotel-rooming-import">
      <div style={{ fontSize: 14, fontWeight: 700 }}>Hotel rooming list</div>
      <div style={muted}>
        Upload a hotel&apos;s <strong>Group Rooming List</strong> (PDF) or a CSV. We guess the hotel, the HS Schedule
        weekend, and which Directory families booked — then mark them <strong>Booked</strong> on that hotel stay.
        Works best with a text PDF from the hotel (like Staybridge / IHG). Scanned image-only PDFs need a CSV export
        instead.
      </div>

      {done ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--rsd-success, #157a3c)" }}>
            Marked {done.marked} player{done.marked === 1 ? "" : "s"} Booked.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/portal/directory?hotelStay=${done.stayId}`} style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-accent)" }}>
              Open in Directory ›
            </Link>
            <Pill
              size="sm"
              variant="ghost"
              onClick={() => {
                setDone(null);
                setPreview(null);
                setFile(null);
              }}
            >
              Import another
            </Pill>
          </div>
        </div>
      ) : (
        <>
          <label
            data-tour="hotel-rooming-file"
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              padding: "24px 16px",
              borderRadius: 12,
              border: "2px dashed var(--gw-border)",
              background: "var(--gw-bg)",
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            <Icons.Download width={22} height={22} style={{ color: "var(--gw-fg-muted)", transform: "rotate(180deg)" }} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              {file ? file.name : "Tap to choose the rooming list"}
            </span>
            <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.45 }}>
              {file
                ? `${Math.max(1, Math.round(file.size / 1024))} KB · tap to pick another`
                : "PDF, CSV or TXT — from Photos, Files, or email"}
            </span>
            <input
              type="file"
              accept="application/pdf,.pdf,text/csv,.csv,text/plain,.txt"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setError(null);
              }}
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
            />
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Pill size="sm" variant="accent" onClick={runPreview} disabled={!file || busy}>
              {busy && !preview ? "Reading…" : "Preview matches"}
            </Pill>
            {!file && (
              <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
                Choose a file above first
              </span>
            )}
          </div>

          {preview && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
              <div style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>
                {preview.fileName} · {preview.parsed.guests.length} room
                {preview.parsed.guests.length === 1 ? "" : "s"}
                {preview.parsed.groupCode ? ` · group ${preview.parsed.groupCode}` : ""}
                {preview.parsed.hotelName ? ` · ${preview.parsed.hotelName}` : ""}
              </div>
              {preview.parsed.warnings.map((w) => (
                <div key={w} style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>
                  {w}
                </div>
              ))}

              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                <Select
                  label="Hotel"
                  value={hotelId}
                  onChange={(e) => {
                    setHotelId(e.target.value);
                    setStayId("");
                  }}
                  help="From External Contacts → Hotels."
                >
                  <option value="">Pick a hotel…</option>
                  {(preview.plan.hotel.candidates.length
                    ? preview.plan.hotel.candidates
                    : preview.plan.hotel.pick
                      ? [preview.plan.hotel.pick]
                      : []
                  ).map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                      {h.city ? ` · ${h.city}` : ""}
                    </option>
                  ))}
                </Select>
                <Select
                  label="HS Schedule weekend"
                  value={weekendId}
                  onChange={(e) => {
                    setWeekendId(e.target.value);
                    setStayId("");
                  }}
                >
                  <option value="">Pick a weekend…</option>
                  {preview.plan.weekend.candidates.map((w) => (
                    <option key={w.id} value={w.id}>
                      {seasonLabel(w.season)} · {w.startsOn} – {w.endsOn}
                      {w.event ? ` · ${w.event}` : ""}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Hotel stay"
                  value={stayId}
                  onChange={(e) => setStayId(e.target.value)}
                  help={willCreate ? "None yet — we'll create one when you apply." : "The stay Booked marks go on."}
                >
                  <option value="">{willCreate ? "Create new stay…" : "Pick a stay…"}</option>
                  {stayChoices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>

              {willCreate && (
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600 }}>
                  New stay name
                  <input
                    value={stayName}
                    onChange={(e) => setStayName(e.target.value)}
                    maxLength={80}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--gw-border)",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  />
                </label>
              )}

              <div style={cap}>
                Guests → players ({matchedCount} of {preview.plan.guests.length} matched)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflow: "auto" }}>
                {preview.plan.guests.map((g) => {
                  const selected = marks[g.guest.confirmation] ?? [];
                  const already = selected.some((id) => preview.alreadyBooked[id]);
                  return (
                    <div
                      key={g.guest.confirmation}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1px solid var(--gw-border)",
                        background: "var(--gw-bg)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{g.displayName}</span>
                        <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                          #{g.guest.confirmation}
                          {g.guest.roomType ? ` · ${g.guest.roomType}` : ""}
                          {g.guest.rate != null ? ` · $${g.guest.rate}` : ""}
                        </span>
                        <span
                          className={`rsd-chip ${
                            g.confidence === "exact" || g.confidence === "likely"
                              ? "rsd-chip-success"
                              : g.confidence === "weak"
                                ? "rsd-chip-mute"
                                : "rsd-chip-error"
                          }`}
                          style={{ fontSize: 10 }}
                        >
                          {g.confidence === "none" ? "Unmatched" : g.confidence}
                        </span>
                        {already && (
                          <span className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>
                            Already Booked
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--gw-fg-muted)" }}>{g.reason}</div>
                      {(g.candidates.length > 0 || selected.length > 0) && (
                        <div style={{ display: "flex", gap: "6px 14px", flexWrap: "wrap" }}>
                          {(g.candidates.length
                            ? g.candidates
                            : selected.map((id) => ({
                                playerId: id,
                                playerName: g.playerNames[selected.indexOf(id)] ?? id,
                                label: "Selected",
                              }))
                          ).map((c) => (
                            <label
                              key={c.playerId}
                              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 }}
                            >
                              <input
                                type="checkbox"
                                checked={selected.includes(c.playerId)}
                                onChange={() => togglePlayer(g.guest.confirmation, c.playerId)}
                              />
                              {c.playerName}
                              <span style={{ fontWeight: 500, color: "var(--gw-fg-muted)" }}>({c.label})</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Pill size="sm" variant="accent" onClick={apply} disabled={busy || matchedCount === 0}>
                  <Icons.CheckCircle width={13} height={13} />
                  {busy ? "Saving…" : `Mark ${matchedCount} Booked`}
                </Pill>
                <Pill
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPreview(null);
                    setError(null);
                  }}
                  disabled={busy}
                >
                  Cancel
                </Pill>
              </div>
            </div>
          )}
        </>
      )}

      {error && <div style={{ fontSize: 12, color: "var(--rsd-danger)" }}>{error}</div>}
    </div>
  );
}
