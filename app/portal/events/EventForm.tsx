"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../components/icons";
import { Input, Pill, Select, Textarea } from "../../components/ui";
import { DateTimePicker } from "../../components/DateTimePicker";
import {
  createEvent,
  updateEvent,
  softDeleteEvent,
} from "../../../lib/events/actions";

interface Area {
  id: string;
  name: string;
}

export interface CategoryOption {
  id: string;
  name: string;
  chip_class: string;
}

export interface RunnablePlaybook {
  id: string;
  title: string;
}

export interface EventInitialValues {
  id?: string;
  title: string;
  description: string;
  startAt: string; // "YYYY-MM-DDTHH:mm" for <input type=datetime-local>
  endAt: string;
  location: string;
  areaId: string;
  categoryId: string;
  shutdownPlaybookId: string;
  recurring: boolean;
  recurWeekdays: number[];
  recurUntil: string; // YYYY-MM-DD
}

const DEFAULTS: EventInitialValues = {
  title: "",
  description: "",
  startAt: "",
  endAt: "",
  location: "",
  areaId: "",
  categoryId: "",
  shutdownPlaybookId: "",
  recurring: false,
  recurWeekdays: [],
  recurUntil: "",
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function EventForm({
  initial,
  areas,
  categories,
  shutdownPlaybooks,
  canDelete,
}: {
  initial?: EventInitialValues;
  areas: Area[];
  categories: CategoryOption[];
  shutdownPlaybooks: RunnablePlaybook[];
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
  const [shutdownPlaybookId, setShutdownPlaybookId] = useState(start.shutdownPlaybookId);
  const [recurring, setRecurring] = useState(start.recurring);
  const [recurWeekdays, setRecurWeekdays] = useState<number[]>(start.recurWeekdays);
  const [recurUntil, setRecurUntil] = useState(start.recurUntil);
  const [error, setError] = useState<string | null>(null);

  function toggleWeekday(d: number) {
    setRecurWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  }
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!startAt) {
      setError("Pick a start date/time.");
      return;
    }
    if (recurring && recurWeekdays.length === 0) {
      setError("Pick at least one weekday for the repeat, or turn off 'Repeats weekly'.");
      return;
    }
    startTransition(async () => {
      const input = {
        title: title.trim(),
        description: description.trim() || null,
        startAt: new Date(startAt).toISOString(),
        endAt: endAt ? new Date(endAt).toISOString() : null,
        location: location.trim() || null,
        areaId: areaId || null,
        categoryId: categoryId || null,
        shutdownPlaybookId: shutdownPlaybookId || null,
        recurring,
        recurWeekdays,
        recurUntil: recurUntil || null,
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
          value={shutdownPlaybookId}
          onChange={(e) => setShutdownPlaybookId(e.target.value)}
          disabled={shutdownPlaybooks.length === 0}
        >
          <option value="">— No shutdown needed —</option>
          {shutdownPlaybooks.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
        <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          {shutdownPlaybooks.length === 0
            ? "No runnable procedures yet — add steps to a playbook to make it selectable."
            : "Link a procedure and a “Start shutdown” checklist appears on this event."}
        </span>
      </div>

      {/* Weekly recurrence (0062). When the event also has a shutdown procedure,
          each occurrence auto-spawns a shutdown task via the daily cron. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px 16px", border: "1px solid var(--gw-border)", borderRadius: 10, background: "var(--gw-bg-elev)" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={recurring}
            onChange={(e) => setRecurring(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--gw-fg)" }}>Repeats weekly</span>
        </label>
        {recurring && (
          <>
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
                        border: `1px solid ${on ? "var(--rsd-accent)" : "var(--gw-border)"}`,
                        background: on ? "var(--rsd-accent)" : "var(--gw-bg)",
                        color: on ? "var(--rsd-accent-on)" : "var(--gw-fg)",
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
            <span style={{ fontSize: 11.5, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>
              {shutdownPlaybookId
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
          <Pill variant="accent" size="md" type="submit" disabled={pending || !title.trim()}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create event"}
          </Pill>
        </div>
      </div>
    </form>
  );
}
