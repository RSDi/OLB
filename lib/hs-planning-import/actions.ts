"use server";

// Importing the HS planning spreadsheet ("Omaha Lightning Schedule … Working
// copy for Coaches and Board"): its Contacts tab into External Contacts and
// its "HS Schedule - 26-27"-style tabs into the HS Schedule. The board only.
//
// Two steps, both reading the uploaded file: previewPlanningImport says what
// would happen; runPlanningImport does it with the choices from the preview.
// Nothing from the preview is trusted on the way back: the file is read and
// the plan worked out again against what's in the database now.

import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { requireStaff } from "../auth/guards";
import { getAuthUser } from "../auth/viewer";
import { seesFullUi } from "../auth/feature-preview";
import { createClient } from "../supabase/server";
import { gridFromSheetJs, type Grid } from "./grid";
import { parseContactsSheet, type ContactBook } from "./contacts-sheet";
import { isScheduleSheet, parseScheduleSheet, type SheetSeason } from "./schedule-sheet";
import { planImport, type Existing, type ExistingContact, type ImportPlan } from "./plan";
import { applyImportPlan, type ApplyOptions, type ApplySummary } from "./apply";

// Next.js stops server-action uploads at 1 MB anyway; the spreadsheet is ~100 KB.
const MAX_BYTES = 1024 * 1024;

async function readUpload(form: FormData): Promise<{ error: string } | { name: string; grids: Grid[] }> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the spreadsheet (.xlsx) first." };
  if (file.size > MAX_BYTES) return { error: "That file is over 1 MB, which is bigger than this spreadsheet should be." };
  try {
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellStyles: true });
    const grids = wb.SheetNames.map((n) => gridFromSheetJs(n, wb.Sheets[n] as unknown as Parameters<typeof gridFromSheetJs>[1]));
    return { name: file.name, grids };
  } catch {
    return { error: "That doesn't open as an Excel spreadsheet. Save it as .xlsx and try again." };
  }
}

function parseWorkbook(grids: Grid[]): { book: ContactBook | null; seasons: SheetSeason[]; warnings: string[] } {
  const warnings: string[] = [];
  const contactsGrid =
    grids.find((g) => /contact/i.test(g.name)) ??
    grids.find((g) => g.rows.slice(0, 12).some((r) => r[0]?.text.toLowerCase() === "program"));
  const book = contactsGrid ? parseContactsSheet(contactsGrid) : null;
  const seasons: SheetSeason[] = [];
  for (const g of grids.filter(isScheduleSheet)) {
    const s = parseScheduleSheet(g);
    if (!s) warnings.push(`"${g.name}" looks like a schedule but has no Event / Location header row, so it was left out.`);
    else if (seasons.some((x) => x.season === s.season))
      warnings.push(`"${g.name}" is a second tab for the same season, so it was left out.`);
    else seasons.push(s);
  }
  if (!book && seasons.length === 0) warnings.push("No Contacts tab and no HS Schedule tabs in this file.");
  return { book, seasons: seasons.sort((a, b) => b.season - a.season), warnings };
}

const CONTACT_COLUMNS =
  "id, kind, name, nickname, parent_contact_id, category_id, email, alt_email, phone, mobile_phone, title, city, state, team_colors, notes, tags, aliases";

async function loadExisting(withSchedule: boolean): Promise<{ error: string } | (Existing & { scheduleError?: string })> {
  const supabase = await createClient();
  const [{ data: cats, error: catErr }, { data: contacts, error: cErr }] = await Promise.all([
    supabase.from("contact_categories").select("id, name").is("deleted_at", null),
    supabase.from("contacts").select(CONTACT_COLUMNS).is("deleted_at", null),
  ]);
  if (catErr) return { error: catErr.message };
  if (cErr) {
    return {
      error: /column/i.test(cErr.message)
        ? "External Contacts needs migration 0107 (supabase/migrations/0107_contact_program_fields.sql) before the import can run."
        : cErr.message,
    };
  }
  let seasons: Existing["seasons"] = [];
  let scheduleError: string | undefined;
  if (withSchedule) {
    const { data: ss, error: sErr } = await supabase.from("hs_seasons").select("id, season");
    if (sErr) {
      scheduleError =
        "The HS Schedule tabs need migration 0108 (supabase/migrations/0108_hs_schedule.sql) first, so only the contacts can be imported now.";
    }
    const list = (ss as { id: string; season: number }[] | null) ?? [];
    const counts = new Map<string, number>();
    if (list.length) {
      const { data: ws } = await supabase.from("hs_weekends").select("season_id").in("season_id", list.map((s) => s.id));
      for (const w of (ws as { season_id: string }[] | null) ?? []) counts.set(w.season_id, (counts.get(w.season_id) ?? 0) + 1);
    }
    seasons = list.map((s) => ({ id: s.id, season: s.season, weekends: counts.get(s.id) ?? 0 }));
  }
  return {
    scheduleError,
    categories: (cats as Existing["categories"] | null) ?? [],
    contacts: ((contacts as unknown as ExistingContact[] | null) ?? []).map((c) => ({
      ...c,
      tags: c.tags ?? [],
      aliases: c.aliases ?? [],
    })),
    seasons,
  };
}

// The schedule tabs are only offered to accounts that can use the HS
// Schedule (still in staged rollout, lib/hs-schedule/access.ts).
async function schedulesAllowed(): Promise<boolean> {
  const user = await getAuthUser();
  return seesFullUi(user?.email);
}

export async function previewPlanningImport(form: FormData): Promise<{ error?: string; plan?: ImportPlan; schedules?: boolean }> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const upload = await readUpload(form);
  if ("error" in upload) return { error: upload.error };
  const withSchedule = await schedulesAllowed();
  const parsed = parseWorkbook(upload.grids);
  const existing = await loadExisting(withSchedule && parsed.seasons.length > 0);
  if ("error" in existing) return { error: existing.error };
  const scheduleOk = withSchedule && !existing.scheduleError;
  const plan = planImport({
    file: upload.name,
    book: parsed.book,
    seasons: scheduleOk ? parsed.seasons : [],
    existing,
    warnings: [...parsed.warnings, ...(withSchedule && existing.scheduleError ? [existing.scheduleError] : [])],
  });
  return { plan, schedules: scheduleOk };
}

export async function runPlanningImport(form: FormData): Promise<{ error?: string; summary?: ApplySummary }> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  let options: ApplyOptions;
  try {
    const raw = JSON.parse(String(form.get("options") ?? "{}")) as Partial<ApplyOptions>;
    options = {
      contacts: raw.contacts === true,
      seasons: Array.isArray(raw.seasons) ? raw.seasons.filter((n) => Number.isInteger(n)) : [],
      replace: Array.isArray(raw.replace) ? raw.replace.filter((n) => Number.isInteger(n)) : [],
      merges:
        raw.merges && typeof raw.merges === "object"
          ? Object.fromEntries(
              Object.entries(raw.merges).filter(
                ([k, v]) => typeof k === "string" && typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)
              )
            )
          : {},
    };
  } catch {
    return { error: "The import choices didn't come through. Try again." };
  }
  if (!(await schedulesAllowed())) options.seasons = [];
  if (!options.contacts && options.seasons.length === 0) return { error: "Pick something to import." };

  const upload = await readUpload(form);
  if ("error" in upload) return { error: upload.error };
  const parsed = parseWorkbook(upload.grids);
  const existing = await loadExisting(options.seasons.length > 0);
  if ("error" in existing) return { error: existing.error };
  if (existing.scheduleError) options.seasons = [];
  if (!options.contacts && options.seasons.length === 0) return { error: existing.scheduleError ?? "Pick something to import." };
  const plan = planImport({ file: upload.name, book: parsed.book, seasons: parsed.seasons, existing, warnings: parsed.warnings });
  // A merge has to point at a company that's there.
  for (const [key, id] of Object.entries(options.merges)) {
    if (!existing.contacts.some((c) => c.id === id && c.kind === "company")) delete options.merges[key];
  }
  const supabase = await createClient();
  const summary = await applyImportPlan(supabase, plan, existing, options, gate.userId);
  revalidatePath("/portal/contacts");
  if (options.seasons.length) revalidatePath("/portal/schedule");
  return { summary };
}
