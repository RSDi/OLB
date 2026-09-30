"use client";
// Import the HS planning spreadsheet: its Contacts tab into External
// Contacts and its "HS Schedule - 26-27" tabs into the HS Schedule. Pick the
// file, see what it would add (and what it found in every weekend), choose,
// import. Opened from External Contacts and from the HS Schedule; the board
// only (lib/hs-planning-import/actions.ts).

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "./icons";
import { Pill } from "./ui";
import { SideSheet } from "./SideSheet";
import { previewPlanningImport, runPlanningImport } from "../../lib/hs-planning-import/actions";
import type { ImportPlan, PlannedCompany, PlannedSeason } from "../../lib/hs-planning-import/plan";
import type { ApplySummary } from "../../lib/hs-planning-import/apply";
import { formatWeekendDates, weekendStatusLabel } from "../../lib/hs-schedule/logic";

const cap: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "var(--gw-fg-muted)",
};

const muted: React.CSSProperties = { fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5 };

const MAX_UPLOAD = 950 * 1024;
const TOO_BIG = "That file is over 1 MB. Save a copy with just the Contacts and HS Schedule tabs (no pictures) and try that.";

export function PlanningImportSheet({ onClose, schedules }: { onClose: () => void; schedules: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [summary, setSummary] = useState<ApplySummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withContacts, setWithContacts] = useState(true);
  const [pickedSeasons, setPickedSeasons] = useState<Set<number>>(new Set());
  const [replace, setReplace] = useState<Set<number>>(new Set());
  const [merges, setMerges] = useState<Record<string, string>>({});

  async function preview() {
    if (!file) return;
    // Uploads to a server action stop at 1 MB; this spreadsheet is ~100 KB.
    if (file.size > MAX_UPLOAD) return setError(TOO_BIG);
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    const res = await previewPlanningImport(form).catch(() => ({ error: "Couldn't reach the server. Try again.", plan: undefined }));
    setBusy(false);
    if (res.error || !res.plan) return setError(res.error ?? "Couldn't read that file.");
    setPlan(res.plan);
    setWithContacts(!!res.plan.contacts && res.plan.contacts.companies.length + res.plan.contacts.people.length > 0);
    // New seasons are ticked; ones already on the schedule wait to be asked.
    setPickedSeasons(new Set(res.plan.seasons.filter((s) => !s.existingId).map((s) => s.season)));
    setReplace(new Set());
    setMerges({});
  }

  async function run() {
    if (!file || !plan) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    form.set(
      "options",
      JSON.stringify({
        contacts: withContacts && !!plan.contacts,
        seasons: [...pickedSeasons],
        replace: [...replace].filter((s) => pickedSeasons.has(s)),
        merges,
      })
    );
    const res = await runPlanningImport(form).catch(() => ({
      error: "Couldn't reach the server, so the import may not have finished. Preview again to see what's there.",
      summary: undefined,
    }));
    setBusy(false);
    if (res.error || !res.summary) return setError(res.error ?? "The import didn't finish.");
    setSummary(res.summary);
  }

  function finish() {
    router.refresh();
    onClose();
  }

  const nothing = plan && !(withContacts && plan.contacts) && pickedSeasons.size === 0;

  return (
    <SideSheet
      eyebrow="HS planning spreadsheet"
      title={summary ? "Imported" : plan ? "What it will import" : "Import the spreadsheet"}
      busy={busy}
      width={680}
      onClose={summary ? finish : onClose}
      tour="import-sheet"
      footer={
        summary ? (
          <>
            {schedules && summary.seasons.length > 0 && (
              <Link href="/portal/schedule" onClick={() => onClose()} style={{ textDecoration: "none" }}>
                <Pill variant="light" size="md">
                  <Icons.Calendar width={14} height={14} /> Open the HS Schedule
                </Pill>
              </Link>
            )}
            <Pill variant="accent" size="md" onClick={finish}>
              Done
            </Pill>
          </>
        ) : plan ? (
          <>
            <Pill variant="ghost" size="md" onClick={() => setPlan(null)} disabled={busy}>
              Back
            </Pill>
            <Pill variant="accent" size="md" onClick={run} disabled={busy || !!nothing}>
              {busy ? "Importing…" : "Import"}
            </Pill>
          </>
        ) : (
          <>
            <Pill variant="ghost" size="md" onClick={onClose} disabled={busy}>
              Cancel
            </Pill>
            <Pill variant="accent" size="md" onClick={preview} disabled={busy || !file}>
              {busy ? "Reading…" : "Preview"}
            </Pill>
          </>
        )
      }
    >
      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            background: "var(--gw-error-bg)",
            border: "1px solid rgba(229,62,62,.25)",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 13,
            color: "var(--gw-error)",
            fontWeight: 600,
          }}
        >
          <Icons.AlertCircle width={16} height={16} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      {summary ? (
        <Summary summary={summary} />
      ) : plan ? (
        <Preview
          plan={plan}
          schedules={schedules}
          withContacts={withContacts}
          setWithContacts={setWithContacts}
          pickedSeasons={pickedSeasons}
          setPickedSeasons={setPickedSeasons}
          replace={replace}
          setReplace={setReplace}
          merges={merges}
          setMerges={setMerges}
        />
      ) : (
        <Pick file={file} setFile={setFile} schedules={schedules} />
      )}
    </SideSheet>
  );
}

function Pick({ file, setFile, schedules }: { file: File | null; setFile: (f: File | null) => void; schedules: boolean }) {
  return (
    <>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--gw-fg)" }}>
        Pick the Excel file (the <strong>Omaha Lightning Schedule … Working copy for Coaches and Board</strong>{" "}
        spreadsheet, or a newer copy). You&apos;ll see everything it would add before anything is saved.
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: "var(--gw-fg-muted)" }}>
        <li>
          <strong style={{ color: "var(--gw-fg)" }}>Contacts tab</strong>: the Tier I and Tier 2 teams become{" "}
          <em>Programs</em>, the gyms <em>Facilities</em>, and the refs <em>Referees</em>, each with the people listed
          and their role, email and phone. Team colors come from the NDII table.
        </li>
        {schedules && (
          <li>
            <strong style={{ color: "var(--gw-fg)" }}>HS Schedule tabs</strong>: one season each, with its weekends,
            the games for each of our teams, the teams coming (confirmed or on the fence) and any scores.
          </li>
        )}
        <li>Contacts you already have are only filled in, never overwritten. Importing twice adds nothing new.</li>
      </ul>
      <label
        data-tour="import-file"
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          padding: "28px 16px",
          borderRadius: 12,
          border: "2px dashed var(--gw-border)",
          background: "var(--gw-bg)",
          cursor: "pointer",
          textAlign: "center",
        }}
      >
        <Icons.Download width={22} height={22} style={{ color: "var(--gw-fg-muted)", transform: "rotate(180deg)" }} />
        <span style={{ fontSize: 14, fontWeight: 700 }}>{file ? file.name : "Choose the .xlsx file"}</span>
        <span style={muted}>{file ? `${Math.round(file.size / 1024)} KB · tap to pick another` : "Excel workbook, up to 1 MB"}</span>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
        />
      </label>
    </>
  );
}

function Preview(props: {
  plan: ImportPlan;
  schedules: boolean;
  withContacts: boolean;
  setWithContacts: (v: boolean) => void;
  pickedSeasons: Set<number>;
  setPickedSeasons: (v: Set<number>) => void;
  replace: Set<number>;
  setReplace: (v: Set<number>) => void;
  merges: Record<string, string>;
  setMerges: (v: Record<string, string>) => void;
}) {
  const { plan } = props;
  return (
    <>
      <div style={muted}>
        From <strong style={{ color: "var(--gw-fg)" }}>{plan.file}</strong>. Nothing is saved until you press{" "}
        <strong style={{ color: "var(--gw-fg)" }}>Import</strong>.
      </div>
      {plan.warnings.map((w) => (
        <div key={w} style={{ ...muted, color: "var(--rsd-warn)" }}>
          {w}
        </div>
      ))}
      {plan.contacts && <ContactsPreview {...props} />}
      {props.schedules &&
        plan.seasons.map((s) => (
          <SeasonPreview
            key={s.season}
            season={s}
            picked={props.pickedSeasons.has(s.season)}
            onPick={(on) => {
              const next = new Set(props.pickedSeasons);
              if (on) next.add(s.season);
              else next.delete(s.season);
              props.setPickedSeasons(next);
            }}
            replace={props.replace.has(s.season)}
            onReplace={(on) => {
              const next = new Set(props.replace);
              if (on) next.add(s.season);
              else next.delete(s.season);
              props.setReplace(next);
            }}
          />
        ))}
    </>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 18, height: 18, marginTop: 1, accentColor: "var(--rsd-accent-fill)" }}
      />
      <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>{children}</span>
    </label>
  );
}

function ActionChip({ action }: { action: "create" | "update" | "same" }) {
  const map = {
    create: { cls: "rsd-chip-accent", label: "New" },
    update: { cls: "rsd-chip-warn", label: "Fills in" },
    same: { cls: "rsd-chip-mute", label: "Already there" },
  } as const;
  const m = map[action];
  return (
    <span className={`rsd-chip ${m.cls}`} style={{ fontSize: 10, whiteSpace: "nowrap" }}>
      {m.label}
    </span>
  );
}

function ContactsPreview(props: {
  plan: ImportPlan;
  withContacts: boolean;
  setWithContacts: (v: boolean) => void;
  merges: Record<string, string>;
  setMerges: (v: Record<string, string>) => void;
}) {
  const cp = props.plan.contacts!;
  const [open, setOpen] = useState(false);
  const counts = useMemo(() => {
    const people = [...cp.companies.flatMap((c) => c.people), ...cp.people];
    const n = (list: { action: string }[], a: string) => list.filter((x) => x.action === a).length;
    return {
      newCompanies: n(cp.companies, "create"),
      fillCompanies: n(cp.companies, "update"),
      sameCompanies: n(cp.companies, "same"),
      newPeople: n(people, "create"),
      fillPeople: n(people, "update"),
      samePeople: n(people, "same"),
    };
  }, [cp]);
  const byType = (t: PlannedCompany["type"]) => cp.companies.filter((c) => c.type === t);

  return (
    <div className="rsd-card" style={{ gap: 12, padding: 16 }}>
      <Check checked={props.withContacts} onChange={props.setWithContacts}>
        Import contacts into External Contacts
      </Check>
      <div style={{ ...muted, paddingLeft: 28 }}>
        {counts.newCompanies} new companies and {counts.newPeople} new people
        {counts.fillCompanies + counts.fillPeople > 0 &&
          ` · fills in ${counts.fillCompanies + counts.fillPeople} you already have`}
        {counts.sameCompanies + counts.samePeople > 0 && ` · ${counts.sameCompanies + counts.samePeople} already there`}
        {cp.typesToCreate.length > 0 && (
          <>
            {" "}
            · adds the contact type{cp.typesToCreate.length > 1 ? "s" : ""} <strong>{cp.typesToCreate.join(" and ")}</strong>
          </>
        )}
        . Programs are tagged <strong>nchc</strong> (Tier I) or <strong>ndii</strong> (Tier 2).
      </div>
      {cp.companies.some((c) => c.similar.length) && (
        <div style={{ paddingLeft: 28, display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={cap}>Might already be in External Contacts</span>
          {cp.companies
            .filter((c) => c.similar.length)
            .map((c) => (
              <div key={c.key} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
                <span style={{ fontWeight: 700 }}>{c.name}</span>
                <select
                  className="rsd-chip"
                  value={props.merges[c.key] ?? ""}
                  onChange={(e) => {
                    const next = { ...props.merges };
                    if (e.target.value) next[c.key] = e.target.value;
                    else delete next[c.key];
                    props.setMerges(next);
                  }}
                  style={{ fontSize: 12, padding: "4px 8px", cursor: "pointer" }}
                  aria-label={`Is ${c.name} one you already have?`}
                >
                  <option value="">Add as a new company</option>
                  {c.similar.map((s) => (
                    <option key={s.id} value={s.id}>
                      Same as {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
        </div>
      )}
      {cp.warnings.map((w) => (
        <div key={w} style={{ ...muted, paddingLeft: 28, color: "var(--rsd-warn)" }}>
          {w}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ alignSelf: "flex-start", marginLeft: 28, background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 700, color: "var(--rsd-accent)", cursor: "pointer" }}
      >
        {open ? "Hide the list" : "Show every contact"}
      </button>
      {open && (
        <div style={{ paddingLeft: 28, display: "flex", flexDirection: "column", gap: 14 }}>
          {(["Programs", "Facilities"] as const).map((t) =>
            byType(t).length ? (
              <div key={t} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={cap}>
                  {t} ({byType(t).length})
                </span>
                {byType(t).map((c) => (
                  <div key={c.key} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{c.name}</span>
                      <ActionChip action={props.merges[c.key] ? "update" : c.action} />
                      {c.values.tags.map((tag) => (
                        <span key={tag} className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div style={muted}>
                      {[
                        [c.values.city, c.values.state].filter(Boolean).join(", "),
                        c.values.team_colors,
                        c.people.map((p) => (p.title ? `${p.name} (${p.title})` : p.name)).join(", "),
                        c.action === "update" ? `fills in ${c.changes.join(", ")}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
            ) : null
          )}
          {cp.people.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={cap}>Referees ({cp.people.length})</span>
              {cp.people.map((p) => (
                <div key={p.key} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
                  <span style={{ fontWeight: 700 }}>{p.name}</span>
                  {p.title && <span style={muted}>{p.title}</span>}
                  <ActionChip action={p.action} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SeasonPreview({
  season,
  picked,
  onPick,
  replace,
  onReplace,
}: {
  season: PlannedSeason;
  picked: boolean;
  onPick: (v: boolean) => void;
  replace: boolean;
  onReplace: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const teams = season.weekends.reduce((n, w) => n + w.teams.length, 0);
  const shown = season.levels.filter((l) => !l.hidden).map((l) => l.label);
  const hidden = season.levels.filter((l) => l.hidden).length;
  return (
    <div className="rsd-card" style={{ gap: 10, padding: 16 }}>
      <Check checked={picked} onChange={onPick}>
        Import the {season.label} schedule <span style={{ ...muted, fontWeight: 600 }}>({season.sheet})</span>
      </Check>
      <div style={{ ...muted, paddingLeft: 28 }}>
        {season.weekends.length} weekends · columns {shown.join(", ")}
        {hidden > 0 && ` (+${hidden} hidden, as in the spreadsheet)`} · {teams} team
        {teams === 1 ? "" : "s"} found
        {season.unmatched.length > 0 && (
          <>
            {" "}
            · not in External Contacts, kept by name: <strong>{season.unmatched.join(", ")}</strong>
          </>
        )}
      </div>
      {season.existingId && (
        <div style={{ paddingLeft: 28 }}>
          <Check checked={replace} onChange={onReplace}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              {season.label} is already on the schedule ({season.existingWeekends} weekends). Replace it with the
              spreadsheet&apos;s version
            </span>
          </Check>
          {picked && !replace && (
            <div style={{ ...muted, color: "var(--rsd-warn)", paddingLeft: 28 }}>
              Tick Replace to import it; otherwise it&apos;s left as it is.
            </div>
          )}
        </div>
      )}
      {season.skipped.map((s) => (
        <div key={s} style={{ ...muted, paddingLeft: 28 }}>
          {s}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ alignSelf: "flex-start", marginLeft: 28, background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 700, color: "var(--rsd-accent)", cursor: "pointer" }}
      >
        {open ? "Hide the weekends" : "Show the weekends and teams"}
      </button>
      {open && (
        <div style={{ paddingLeft: 28, display: "flex", flexDirection: "column", gap: 10 }}>
          {season.weekends.map((w) => (
            <div key={`${w.row}`} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 92, fontVariantNumeric: "tabular-nums" }}>
                  {formatWeekendDates(w.starts_on, w.ends_on)}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{w.event || "—"}</span>
                {w.status !== "planned" && (
                  <span className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>
                    {weekendStatusLabel(w.status)}
                  </span>
                )}
              </div>
              {(w.teams.length > 0 || w.games.length > 0) && (
                <div style={{ ...muted, paddingLeft: 100 }}>
                  {w.games.length > 0 &&
                    w.games
                      .map((g) => `${g.label} ${g.games ?? ""}${g.unsure ? "?" : ""}`.trim())
                      .join(" · ")}
                  {w.games.length > 0 && w.teams.length > 0 && " — "}
                  {w.teams
                    .map(
                      (t) =>
                        `${t.name}${t.ref ? "" : " (name only)"}${t.levels ? ` [${t.levels.join(", ")}]` : ""}${
                          t.status === "tentative" ? " (on the fence)" : ""
                        }${t.our_score != null ? ` ${t.our_score > t.their_score! ? "W" : t.our_score < t.their_score! ? "L" : "T"} ${t.our_score}–${t.their_score}` : ""}`
                    )
                    .join(", ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Summary({ summary }: { summary: ApplySummary }) {
  const lines: string[] = [];
  if (summary.typesCreated.length)
    lines.push(
      `Added the contact type${summary.typesCreated.length > 1 ? "s" : ""} ${summary.typesCreated.join(" and ")}, which coaches can see (Settings → Contact Types).`
    );
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  if (summary.companiesCreated || summary.peopleCreated)
    lines.push(
      `Added ${n(summary.companiesCreated, "company", "companies")} and ${n(summary.peopleCreated, "person", "people")} to External Contacts.`
    );
  if (summary.companiesUpdated || summary.peopleUpdated)
    lines.push(`Filled in ${n(summary.companiesUpdated + summary.peopleUpdated, "contact", "contacts")} you already had.`);
  for (const s of summary.seasons)
    lines.push(`${s.replaced ? "Replaced" : "Added"} the ${s.label} schedule: ${s.weekends} weekends, ${s.teams} team entries.`);
  lines.push(...summary.skippedSeasons);
  if (lines.length === 0 && summary.errors.length === 0) lines.push("Everything was already there; nothing changed.");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {lines.map((l) => (
        <div key={l} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, lineHeight: 1.5 }}>
          <Icons.CheckCircle width={16} height={16} style={{ color: "var(--gw-success)", flexShrink: 0, marginTop: 2 }} />
          {l}
        </div>
      ))}
      {summary.errors.map((e) => (
        <div key={e} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: "var(--gw-error)", fontWeight: 600 }}>
          <Icons.AlertTriangle width={16} height={16} style={{ flexShrink: 0, marginTop: 2 }} />
          {e}
        </div>
      ))}
    </div>
  );
}
