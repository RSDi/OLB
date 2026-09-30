"use client";
import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../components/icons";
import { Input, Pill, Select, Textarea } from "../../components/ui";
import { DateTimePicker } from "../../components/DateTimePicker";
import { fromZonedDatetimeLocal } from "../../../lib/dates/zoned";
import {
  createEvent,
  updateEvent,
  softDeleteEvent,
} from "../../../lib/events/actions";
import { ComboSelect } from "../../components/ComboSelect";

interface Area {
  id: string;
  name: string;
}

export interface CategoryOption {
  id: string;
  name: string;
  chip_class: string;
}

export interface RunnableProcedure {
  id: string;
  // "Playbook — Procedure"
  label: string;
}

export interface EventInitialValues {
  id?: string;
  title: string;
  description: string;
  startAt: string; // "YYYY-MM-DDTHH:mm" in Central time, for <input type=datetime-local>
  endAt: string;
  location: string;
  areaId: string;
  categoryId: string;
  shutdownProcedureId: string;
  recurring: boolean;
  recurFreq: "weekly" | "monthly";
  recurWeekdays: number[];
  recurMonthlyWeek: number | null; // 1-4 or -1 (last)
  recurMonthlyWeekday: number | null; // 0-6
  recurUntil: string; // YYYY-MM-DD
  recurExcept: string[]; // YYYY-MM-DD[]
}

const DEFAULTS: EventInitialValues = {
  title: "",
  description: "",
  startAt: "",
  endAt: "",
  location: "",
  areaId: "",
  categoryId: "",
  shutdownProcedureId: "",
  recurring: false,
  recurFreq: "weekly",
  recurWeekdays: [],
  recurMonthlyWeek: null,
  recurMonthlyWeekday: null,
  recurUntil: "",
  recurExcept: [],
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEK_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "First" },
  { value: 2, label: "Second" },
  { value: 3, label: "Third" },
  { value: 4, label: "Fourth" },
  { value: -1, label: "Last" },
];

const SKIP_WEEK_LABELS: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", [-1]: "Last" };
const SKIP_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const skipSelectStyle: CSSProperties = {
  height: 38, padding: "0 8px", borderRadius: 8, border: "1px solid var(--gw-border)",
  background: "var(--gw-bg)", color: "var(--gw-fg)", fontSize: 13, fontWeight: 700,
};

function fmtSkip(d: string): string {
  // Repeating-skip rule ("rule:<week>:<weekday>") → "Every Last Sun".
  if (d.startsWith("rule:")) {
    const [, w, wd] = d.split(":");
    return `Every ${SKIP_WEEK_LABELS[Number(w)] ?? ""} ${SKIP_DAY_LABELS[Number(wd)] ?? ""}`.replace(/\s+/g, " ").trim();
  }
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function EventForm({
  initial,
  areas,
  categories,
  shutdownProcedures,
  canDelete,
}: {
  initial?: EventInitialValues;
  areas: Area[];
  categories: CategoryOption[];
  shutdownProcedures: RunnableProcedure[];
  canDelete?: boolean;
}) {
  const router = useRouter();
  const start = initial ?? DEFAULTS;
  const isEdit = Boolean(initial?.id);

  const [title, setTitle] = useState(start.title);
  const [description, setDescription] = useState(start.description);
  const [startAt, setStartAt] = useState(start.startAt);
  const [endAt, setEndAt] = useState(start.endAt);
  const [location, setLocation] = useState(start.location);
  const [areaId, setAreaId] = useState(start.areaId);
  const [categoryId, setCategoryId] = useState(start.categoryId);
  const [shutdownProcedureId, setShutdownProcedureId] = useState(start.shutdownProcedureId);
  const [recurring, setRecurring] = useState(start.recurring);
  const [recurFreq, setRecurFreq] = useState<"weekly" | "monthly">(start.recurFreq);
  const [recurWeekdays, setRecurWeekdays] = useState<number[]>(start.recurWeekdays);
  const [recurMonthlyWeek, setRecurMonthlyWeek] = useState<number | null>(start.recurMonthlyWeek);
  const [recurMonthlyWeekday, setRecurMonthlyWeekday] = useState<number | null>(start.recurMonthlyWeekday);
  const [recurUntil, setRecurUntil] = useState(start.recurUntil);
  const [recurExcept, setRecurExcept] = useState<string[]>(start.recurExcept);
  const [skipDraft, setSkipDraft] = useState("");
  // Repeating-skip rule draft: which Nth weekday of each month to skip.
  const [skipRuleWeek, setSkipRuleWeek] = useState<number>(-1); // default "Last"
  const [skipRuleWeekday, setSkipRuleWeekday] = useState<number>(0); // default Sunday
  const [error, setError] = useState<string | null>(null);

  function toggleWeekday(d: number) {
    setRecurWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  }
  function addSkip() {
    if (skipDraft && !recurExcept.includes(skipDraft)) {
      setRecurExcept((prev) => [...prev, skipDraft].sort());
    }
    setSkipDraft("");
  }
  function addSkipRule() {
    const entry = `rule:${skipRuleWeek}:${skipRuleWeekday}`;
    if (!recurExcept.includes(entry)) {
      setRecurExcept((prev) => [...prev, entry]);
    }
  }
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Give the event a title (the field at the top).");
      return;
    }
    if (!startAt) {
      setError("Pick a start date/time.");
      return;
    }
    if (recurring && recurFreq === "weekly" && recurWeekdays.length === 0) {
      setError("Pick at least one weekday for the repeat, or turn off 'Repeats'.");
      return;
    }
    if (recurring && recurFreq === "monthly" && (recurMonthlyWeek == null || recurMonthlyWeekday == null)) {
      setError("Pick which weekday of the month it repeats on (e.g. Last Sunday).");
      return;
    }
    startTransition(async () => {
      const input = {
        title: title.trim(),
        description: description.trim() || null,
        // The fields hold Central wall-clock times, whatever the browser's timezone.
        startAt: fromZonedDatetimeLocal(startAt).toISOString(),
        endAt: endAt ? fromZonedDatetimeLocal(endAt).toISOString() : null,
        location: location.trim() || null,
        areaId: areaId || null,
        categoryId: categoryId || null,
        shutdownProcedureId: shutdownProcedureId || null,
        recurring,
        recurFreq,
        recurWeekdays,
        recurMonthlyWeek,
        recurMonthlyWeekday,
        recurUntil: recurUntil || null,
        recurExcept,
      };
      const result = isEdit && initial?.id
        ? await updateEvent(initial.id, input)
        : await createEvent(input);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/portal/events");
    });
  }

  async function handleDelete() {
    if (!initial?.id) return;
    if (!confirm(`Delete "${initial.title}"? This moves it to the deleted bin.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await softDeleteEvent(initial.id!);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/portal/events");
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rsd-card"
      style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}
    >
      <Input
        label="Title *"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Prophecy Conference"
        required
        autoFocus
      />

      <Textarea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Anything attendees should know."
        rows={3}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <DateTimePicker label="Start *" value={startAt} onChange={setStartAt} required />
        <DateTimePicker label="End (optional)" value={endAt} onChange={setEndAt} placeholder="No end time" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Select label="Area (optional)" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
          <option value="">— No area —</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Input
          label="Location (free text)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder='e.g. "Off-site at Mahoney"'
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Select
          label="Category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">— No category —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          {categories.length === 0
            ? "No categories yet — add some in Settings → Event Categories."
            : "Manage available categories in Settings → Event Categories."}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Select
          label="Building shutdown"
          value={shutdownProcedureId}
          onChange={(e) => setShutdownProcedureId(e.target.value)}
          disabled={shutdownProcedures.length === 0}
        >
          <option value="">— No shutdown needed —</option>
          {shutdownProcedures.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
        <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          {shutdownProcedures.length === 0
            ? "No runnable procedures yet — add steps to a playbook to make it selectable."
            : "Link a procedure and a “Start shutdown” checklist appears on this event."}
        </span>
      </div>

      {/* Recurrence (0062/0063): weekly or monthly, with skip dates. When the
          event also has a shutdown procedure, each occurrence auto-spawns a
          shutdown task via the daily cron. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 16px", border: "1px solid var(--gw-border)", borderRadius: 10, background: "var(--gw-bg-elev)" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={recurring}
            onChange={(e) => setRecurring(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--gw-fg)" }}>Repeats</span>
        </label>
        {recurring && (
          <>
            {/* Frequency toggle */}
            <div style={{ display: "flex", gap: 6 }}>
              {(["weekly", "monthly"] as const).map((f) => {
                const on = recurFreq === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setRecurFreq(f)}
                    style={{
                      padding: "6px 16px",
                      borderRadius: 100,
                      border: `1px solid ${on ? "var(--rsd-accent-fill)" : "var(--gw-border)"}`,
                      background: on ? "var(--rsd-accent-fill)" : "var(--gw-bg)",
                      color: on ? "var(--rsd-accent-fill-on)" : "var(--gw-fg)",
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      textTransform: "capitalize",
                    }}
                  >
                    {f}
                  </button>
                );
              })}
            </div>

            {recurFreq === "weekly" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)" }}>On these days</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {WEEKDAY_LABELS.map((label, d) => {
                    const on = recurWeekdays.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleWeekday(d)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 100,
                          border: `1px solid ${on ? "var(--rsd-accent-fill)" : "var(--gw-border)"}`,
                          background: on ? "var(--rsd-accent-fill)" : "var(--gw-bg)",
                          color: on ? "var(--rsd-accent-fill-on)" : "var(--gw-fg)",
                          fontSize: 12.5,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)" }}>On the</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <ComboSelect
                    value={recurMonthlyWeek ?? ""}
                    onChange={(e) => setRecurMonthlyWeek(e.target.value === "" ? null : Number(e.target.value))}
                    style={{ height: 40, padding: "0 12px", borderRadius: 8, border: "1px solid var(--gw-border)", background: "var(--gw-bg)", color: "var(--gw-fg)", fontSize: 13.5 }}
                  >
                    <option value="">—</option>
                    {WEEK_OPTIONS.map((w) => (
                      <option key={w.value} value={w.value}>{w.label}</option>
                    ))}
                  </ComboSelect>
                  <ComboSelect
                    value={recurMonthlyWeekday ?? ""}
                    onChange={(e) => setRecurMonthlyWeekday(e.target.value === "" ? null : Number(e.target.value))}
                    style={{ height: 40, padding: "0 12px", borderRadius: 8, border: "1px solid var(--gw-border)", background: "var(--gw-bg)", color: "var(--gw-fg)", fontSize: 13.5 }}
                  >
                    <option value="">—</option>
                    {WEEKDAY_FULL.map((label, d) => (
                      <option key={d} value={d}>{label}</option>
                    ))}
                  </ComboSelect>
                  <span style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>of the month</span>
                </div>
              </div>
            )}

            <label style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 240 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)" }}>Repeat until (optional)</span>
              <input
                type="date"
                value={recurUntil}
                onChange={(e) => setRecurUntil(e.target.value)}
                style={{ height: 40, padding: "0 12px", borderRadius: 8, border: "1px solid var(--gw-border)", background: "var(--gw-bg)", color: "var(--gw-fg)", fontSize: 13.5 }}
              />
              <span style={{ fontSize: 11.5, color: "var(--gw-fg-muted)" }}>Leave blank to repeat indefinitely.</span>
            </label>

            {/* Skip dates */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)" }}>Skip specific dates</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="date"
                  value={skipDraft}
                  onChange={(e) => setSkipDraft(e.target.value)}
                  style={{ height: 38, padding: "0 12px", borderRadius: 8, border: "1px solid var(--gw-border)", background: "var(--gw-bg)", color: "var(--gw-fg)", fontSize: 13.5 }}
                />
                <button
                  type="button"
                  onClick={addSkip}
                  disabled={!skipDraft}
                  style={{ padding: "8px 14px", borderRadius: 100, border: "1px solid var(--gw-border)", background: "var(--gw-bg)", color: "var(--gw-fg)", fontSize: 12.5, fontWeight: 700, cursor: skipDraft ? "pointer" : "not-allowed", opacity: skipDraft ? 1 : 0.5 }}
                >
                  Add skip
                </button>
              </div>
              {/* Repeating skip — e.g. the last Sunday of every month. */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, color: "var(--gw-fg-muted)" }}>
                <span>or skip the</span>
                <ComboSelect
                  value={skipRuleWeek}
                  onChange={(e) => setSkipRuleWeek(Number(e.target.value))}
                  style={skipSelectStyle}
                >
                  <option value={1}>1st</option>
                  <option value={2}>2nd</option>
                  <option value={3}>3rd</option>
                  <option value={4}>4th</option>
                  <option value={-1}>Last</option>
                </ComboSelect>
                <ComboSelect
                  value={skipRuleWeekday}
                  onChange={(e) => setSkipRuleWeekday(Number(e.target.value))}
                  style={skipSelectStyle}
                >
                  {SKIP_DAY_LABELS.map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </ComboSelect>
                <span>of every month</span>
                <button
                  type="button"
                  onClick={addSkipRule}
                  style={{ padding: "8px 14px", borderRadius: 100, border: "1px solid var(--gw-border)", background: "var(--gw-bg)", color: "var(--gw-fg)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
                >
                  Add
                </button>
              </div>
              {recurExcept.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                  {recurExcept.map((d) => (
                    <span key={d} className="rsd-chip rsd-chip-mute" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {fmtSkip(d)}
                      <button
                        type="button"
                        onClick={() => setRecurExcept((prev) => prev.filter((x) => x !== d))}
                        style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: 800, padding: 0, lineHeight: 1 }}
                        aria-label={`Remove skip ${fmtSkip(d)}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <span style={{ fontSize: 11.5, color: "var(--gw-fg-muted)" }}>
                e.g. the Sunday you meet at the lake — skip it here and add a separate event for that day.
              </span>
            </div>

            <span style={{ fontSize: 11.5, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>
              {shutdownProcedureId
                ? "A shutdown task will be generated for each occurrence and appear in the Tasks queue to assign."
                : "Link a shutdown procedure above to auto-generate a shutdown task per occurrence."}
            </span>
          </>
        )}
      </div>

      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--gw-error-bg)",
            border: "1px solid rgba(229,62,62,.25)",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 13,
            color: "var(--gw-error)",
            fontWeight: 600,
          }}
        >
          <Icons.AlertCircle width={16} height={16} />
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
        <div>
          {isEdit && canDelete && (
            <Pill variant="ghost" size="sm" onClick={handleDelete} disabled={pending}>
              <Icons.Trash width={12} height={12} /> Delete event
            </Pill>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Pill
            variant="ghost"
            size="md"
            onClick={() => router.push("/portal/events")}
            disabled={pending}
          >
            Cancel
          </Pill>
          <Pill variant="accent" size="md" type="submit" disabled={pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create event"}
          </Pill>
        </div>
      </div>
    </form>
  );
}
