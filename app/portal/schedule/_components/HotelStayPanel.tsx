"use client";
// Hotel stays on a weekend: pick the hotel contact, booking instructions, who
// it covers. Travel and the board edit; coaches only read. Directory link
// filters to Missing for follow-ups.

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Icons } from "../../../components/icons";
import { Input, Pill, Select, Textarea } from "../../../components/ui";
import {
  createHotelStay,
  deleteHotelStay,
  updateHotelStay,
} from "../../../../lib/hs-hotel-stays/actions";
import { stayStatusLabel, type HotelStayInput } from "../../../../lib/hs-hotel-stays/logic";
import type { HotelOption } from "../../../../lib/hs-hotel-stays/data";
import {
  HOTEL_STAY_CODE_MAX,
  HOTEL_STAY_NAME_MAX,
  HOTEL_STAY_URL_MAX,
  type HotelStayStatus,
  type HotelStayView,
} from "../../../../lib/hs-hotel-stays/types";
import type { DirectoryTeam } from "./SeasonSheet";
import { teamLabel } from "../../../../lib/teams/volunteer-options";

const cap: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: "var(--gw-fg-muted)",
};

export function HotelStayPanel({
  weekendId,
  weekendEvent,
  stays,
  hotels,
  teams,
  canEdit,
}: {
  weekendId: string;
  weekendEvent: string;
  stays: HotelStayView[];
  hotels: HotelOption[];
  teams: DirectoryTeam[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--gw-border)", paddingTop: 12 }} data-tour="hotel-stays">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span style={cap}>Hotel stays</span>
        {canEdit && !adding && !editingId && (
          <span data-tour="hotel-stay-add" style={{ display: "inline-flex" }}>
            <Pill size="sm" variant="light" onClick={() => setAdding(true)}>
              <Icons.Plus width={12} height={12} /> Add hotel stay
            </Pill>
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.45 }}>
        Link the hotel in External Contacts, write how families book, then track who&apos;s Booked in block in the Directory.
      </div>

      {stays.length === 0 && !adding && (
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>
          {canEdit ? "No hotel stay on this weekend yet." : "No hotel stay set for this weekend."}
        </div>
      )}

      {stays.map((s) =>
        editingId === s.id ? (
          <StayForm
            key={s.id}
            weekendId={weekendId}
            weekendEvent={weekendEvent}
            hotels={hotels}
            teams={teams}
            initial={s}
            onCancel={() => setEditingId(null)}
            onSaved={() => {
              setEditingId(null);
              router.refresh();
            }}
          />
        ) : (
          <StayCard
            key={s.id}
            stay={s}
            canEdit={canEdit}
            onEdit={() => setEditingId(s.id)}
            onDeleted={() => router.refresh()}
          />
        )
      )}

      {adding && (
        <StayForm
          weekendId={weekendId}
          weekendEvent={weekendEvent}
          hotels={hotels}
          teams={teams}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function StayCard({
  stay,
  canEdit,
  onEdit,
  onDeleted,
}: {
  stay: HotelStayView;
  canEdit: boolean;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirm(`Remove "${stay.name}" from this weekend? Booked in block and Staying elsewhere marks for families are removed too.`)) return;
    setBusy(true);
    const result = await deleteHotelStay(stay.id);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onDeleted();
  }

  const directoryHref = `/portal/directory?hotelStay=${stay.id}`;

  return (
    <div
      className="rsd-card"
      style={{ gap: 8, padding: "12px 14px", opacity: busy ? 0.6 : 1 }}
      data-tour="hotel-stay-card"
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{stay.name}</span>
            <span className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>
              {stayStatusLabel(stay.status)}
            </span>
          </div>
          <Link
            href={`/portal/contacts/${stay.hotel_contact_id}`}
            style={{ fontSize: 12.5, fontWeight: 600, color: "var(--gw-accent)", textDecoration: "none" }}
          >
            {stay.hotel_name}
            {stay.hotel_city ? ` · ${stay.hotel_city}` : ""}
          </Link>
          {stay.cutoff_on && (
            <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
              Book by {formatDay(stay.cutoff_on)}
            </span>
          )}
        </div>
        {canEdit && (
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <IconBtn title="Edit" onClick={onEdit} disabled={busy}>
              <Icons.Pencil width={13} height={13} />
            </IconBtn>
            <IconBtn title="Remove" onClick={remove} disabled={busy} danger>
              <Icons.Trash width={13} height={13} />
            </IconBtn>
          </div>
        )}
      </div>

      {stay.booking_code && (
        <div style={{ fontSize: 12, fontWeight: 600 }}>
          Code: <span style={{ fontVariantNumeric: "tabular-nums" }}>{stay.booking_code}</span>
        </div>
      )}
      {stay.booking_url && (
        <a href={stay.booking_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-accent)" }}>
          Booking link ↗
        </a>
      )}
      {stay.booking_instructions && (
        <div style={{ fontSize: 12.5, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{stay.booking_instructions}</div>
      )}
      {stay.rate_notes && (
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{stay.rate_notes}</div>
      )}
      <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
        {stay.team_ids?.length ? `${stay.team_ids.length} team${stay.team_ids.length === 1 ? "" : "s"}` : "All players"}
      </div>
      <Link href={directoryHref} style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-accent)", textDecoration: "none" }}>
        Track Booked in block in Directory ›
      </Link>
      {error && <div style={{ fontSize: 12, color: "var(--rsd-danger)" }}>{error}</div>}
    </div>
  );
}

function StayForm({
  weekendId,
  weekendEvent,
  hotels,
  teams,
  initial,
  onCancel,
  onSaved,
}: {
  weekendId: string;
  weekendEvent: string;
  hotels: HotelOption[];
  teams: DirectoryTeam[];
  initial?: HotelStayView;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? (weekendEvent.trim() || "Hotel stay"));
  const [hotelId, setHotelId] = useState(initial?.hotel_contact_id ?? "");
  const [allTeams, setAllTeams] = useState(!initial?.team_ids?.length);
  const [teamIds, setTeamIds] = useState<string[]>(initial?.team_ids ?? []);
  const [instructions, setInstructions] = useState(initial?.booking_instructions ?? "");
  const [url, setUrl] = useState(initial?.booking_url ?? "");
  const [code, setCode] = useState(initial?.booking_code ?? "");
  const [cutoff, setCutoff] = useState(initial?.cutoff_on ?? "");
  const [rates, setRates] = useState(initial?.rate_notes ?? "");
  const [status, setStatus] = useState<HotelStayStatus>(initial?.status ?? "open");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTeam(id: string) {
    setTeamIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const input: HotelStayInput = {
      weekendId,
      hotelContactId: hotelId,
      name,
      teamIds: allTeams ? null : teamIds,
      bookingInstructions: instructions,
      bookingUrl: url,
      bookingCode: code,
      cutoffOn: cutoff,
      rateNotes: rates,
      status,
    };
    setPending(true);
    setError(null);
    const result = initial ? await updateHotelStay(initial.id, input) : await createHotelStay(input);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  const checkLabel: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 600,
  };

  return (
    <form onSubmit={save} className="rsd-card" style={{ gap: 12, padding: "14px 16px" }} data-tour="hotel-stay-form">
      <Input
        label="Name *"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={HOTEL_STAY_NAME_MAX}
        help="What families see — e.g. Regionals, Nationals, Des Moines weekend."
        required
      />
      <Select
        label="Hotel *"
        value={hotelId}
        onChange={(e) => setHotelId(e.target.value)}
        help="From External Contacts → Hotels. Add the hotel there first if it isn't listed."
        required
      >
        <option value="">Pick a hotel…</option>
        {hotels.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
            {h.city ? ` · ${h.city}` : ""}
          </option>
        ))}
      </Select>
      {hotels.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>
          No hotels yet.{" "}
          <Link href="/portal/contacts/new" style={{ fontWeight: 700, color: "var(--gw-accent)" }}>
            Add one in External Contacts
          </Link>
          .
        </div>
      )}

      <Textarea
        label="How to book"
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        rows={3}
        placeholder="Room block link, group code steps, who to call, deadline notes…"
        help="Instructions families follow to register for this hotel."
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <Input
          label="Booking link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          maxLength={HOTEL_STAY_URL_MAX}
        />
        <Input
          label="Group / booking code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={HOTEL_STAY_CODE_MAX}
        />
        <Input label="Book by" type="date" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as HotelStayStatus)}>
          <option value="draft">Draft</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="canceled">Canceled</option>
        </Select>
      </div>
      <Textarea
        label="Rates / room notes"
        value={rates}
        onChange={(e) => setRates(e.target.value)}
        rows={2}
        placeholder="Rate we got, what worked last time…"
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Who registers</span>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label style={checkLabel}>
            <input type="radio" checked={allTeams} onChange={() => setAllTeams(true)} />
            All players
          </label>
          <label style={checkLabel}>
            <input type="radio" checked={!allTeams} onChange={() => setAllTeams(false)} />
            Only some teams
          </label>
        </div>
        {!allTeams &&
          (teams.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>No Directory teams this season yet.</span>
          ) : (
            <div style={{ display: "flex", gap: "6px 16px", flexWrap: "wrap" }}>
              {teams.map((t) => (
                <label key={t.id} style={checkLabel}>
                  <input type="checkbox" checked={teamIds.includes(t.id)} onChange={() => toggleTeam(t.id)} />
                  {teamLabel(t)}
                </label>
              ))}
            </div>
          ))}
      </div>

      {error && <div style={{ fontSize: 12, color: "var(--rsd-danger)" }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Pill>
        <Pill variant="accent" size="sm" type="submit" disabled={pending || !name.trim() || !hotelId}>
          {pending ? "Saving…" : initial ? "Save stay" : "Add stay"}
        </Pill>
      </div>
    </form>
  );
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function IconBtn({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        border: "1px solid var(--gw-border)",
        background: "var(--gw-bg-elev)",
        color: danger ? "var(--rsd-danger)" : "var(--gw-fg-muted)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}
