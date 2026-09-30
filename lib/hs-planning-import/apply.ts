// Writes an import plan (./plan.ts) with the signed-in board member's
// session, so row-level security applies as it does in the app. Server-only.
//
// Contacts first (types, companies, then their people), so the schedule can
// link to them; then each season picked: the season, its teams (columns),
// weekends, games and the teams coming. Ids are made up front so the rows
// can point at each other before they're inserted. A season that fails
// partway is deleted again (its rows go with it), so re-running the import
// starts it clean.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fillIns, type ContactRef, type Existing, type ImportPlan, type PlannedPerson } from "./plan.ts";
import { addDays } from "../hs-schedule/logic.ts";

export interface ApplyOptions {
  contacts: boolean;
  // Seasons to import (by the year they start), and which of those already
  // exist and should be replaced.
  seasons: number[];
  replace: number[];
  // A company the preview matched to one already in External Contacts
  // instead of adding it: plan key → existing contact id.
  merges: Record<string, string>;
}

export interface ApplySummary {
  typesCreated: string[];
  companiesCreated: number;
  companiesUpdated: number;
  peopleCreated: number;
  peopleUpdated: number;
  seasons: { season: number; label: string; weekends: number; teams: number; replaced: boolean }[];
  skippedSeasons: string[];
  errors: string[];
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function insertAll(db: SupabaseClient, table: string, rows: Record<string, unknown>[]): Promise<string | null> {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from(table).insert(rows.slice(i, i + 200));
    if (error) return error.message;
  }
  return null;
}

export async function applyImportPlan(
  db: SupabaseClient,
  plan: ImportPlan,
  existing: Existing,
  opts: ApplyOptions,
  userId: string
): Promise<ApplySummary> {
  const summary: ApplySummary = {
    typesCreated: [],
    companiesCreated: 0,
    companiesUpdated: 0,
    peopleCreated: 0,
    peopleUpdated: 0,
    seasons: [],
    skippedSeasons: [],
    errors: [],
  };
  // Plan key → the contact it became.
  const contactIds = new Map<string, string>();
  const byId = new Map(existing.contacts.map((c) => [c.id, c]));

  // ─── Contacts ─────────────────────────────────────────────────────────────
  if (opts.contacts && plan.contacts) {
    const cp = plan.contacts;
    const typeIds: Record<string, string | null> = { ...cp.typeIds } as Record<string, string | null>;
    for (const t of cp.typesToCreate) {
      const { data, error } = await db
        .from("contact_categories")
        .insert({ name: t, slug: slugify(t), sort_order: 100 })
        .select("id")
        .single();
      if (error || !data) {
        // Someone added it meanwhile: use theirs.
        const { data: again } = await db
          .from("contact_categories")
          .select("id")
          .ilike("name", t)
          .is("deleted_at", null)
          .maybeSingle();
        if (!again) {
          summary.errors.push(`Couldn't add the contact type "${t}": ${error?.message ?? "unknown error"}`);
          continue;
        }
        typeIds[t] = (again as { id: string }).id;
        continue;
      }
      typeIds[t] = (data as { id: string }).id;
      summary.typesCreated.push(t);
    }

    const newRows: Record<string, unknown>[] = [];
    const updates: { id: string; patch: Record<string, unknown> }[] = [];

    const person = (p: PlannedPerson, parentId: string | null, typeId: string | null) => {
      const target = p.existingId ? byId.get(p.existingId) : null;
      if (target) {
        contactIds.set(p.key, target.id);
        const { patch } = fillIns(target, p.values, { categoryId: typeId, parentId });
        if (Object.keys(patch).length) {
          updates.push({ id: target.id, patch });
          summary.peopleUpdated++;
        }
        return;
      }
      const id = crypto.randomUUID();
      contactIds.set(p.key, id);
      newRows.push({
        id,
        kind: "person",
        parent_contact_id: parentId,
        category_id: typeId,
        ...p.values,
        created_by: userId,
      });
      summary.peopleCreated++;
    };

    for (const c of cp.companies) {
      const typeId = typeIds[c.type] ?? null;
      const mergeInto = opts.merges[c.key];
      const targetId = mergeInto ?? c.existingId;
      const target = targetId ? byId.get(targetId) : null;
      let companyId: string;
      if (target) {
        companyId = target.id;
        // Merged into a company with another name: keep the sheet's name as
        // an alias, so the schedule's team names still find it.
        const values =
          mergeInto && target.name.trim().toLowerCase() !== c.values.name.trim().toLowerCase()
            ? { ...c.values, aliases: [...c.values.aliases, c.values.name] }
            : c.values;
        const { patch } = fillIns(target, values, { categoryId: typeId });
        if (Object.keys(patch).length) {
          updates.push({ id: target.id, patch });
          summary.companiesUpdated++;
        }
      } else {
        companyId = crypto.randomUUID();
        const { title: _title, mobile_phone: _mobile, ...values } = c.values;
        void _title;
        void _mobile;
        newRows.push({ id: companyId, kind: "company", category_id: typeId, ...values, created_by: userId });
        summary.companiesCreated++;
      }
      contactIds.set(c.key, companyId);
      for (const p of c.people) person(p, companyId, typeId);
    }
    for (const p of cp.people) person(p, null, typeIds[p.type] ?? null);

    // Companies before the people who work there.
    const companies = newRows.filter((r) => r.kind === "company");
    const people = newRows.filter((r) => r.kind === "person");
    const err = (await insertAll(db, "contacts", companies)) ?? (await insertAll(db, "contacts", people));
    if (err) {
      summary.errors.push(`Adding contacts stopped: ${err}`);
      return summary;
    }
    for (const u of updates) {
      const { error } = await db.from("contacts").update(u.patch).eq("id", u.id);
      if (error) summary.errors.push(`Updating a contact failed: ${error.message}`);
    }
  }

  const resolve = (ref: ContactRef | null): string | null => {
    if (!ref) return null;
    if ("existingId" in ref) return ref.existingId;
    return contactIds.get(ref.key) ?? null;
  };

  // ─── Seasons ──────────────────────────────────────────────────────────────
  for (const s of plan.seasons) {
    if (!opts.seasons.includes(s.season)) continue;
    let replaced = false;
    if (s.existingId) {
      if (!opts.replace.includes(s.season)) {
        summary.skippedSeasons.push(`${s.label} is already on the schedule, so it was left as it is.`);
        continue;
      }
      const { error } = await db.from("hs_seasons").delete().eq("id", s.existingId);
      if (error) {
        summary.errors.push(`Couldn't replace ${s.label}: ${error.message}`);
        continue;
      }
      replaced = true;
    }

    const seasonId = crypto.randomUUID();
    const now = new Date().toISOString();
    const { error: seasonErr } = await db.from("hs_seasons").insert({
      id: seasonId,
      season: s.season,
      title: s.title,
      imported_from: `${plan.file} · ${s.sheet}`,
      imported_at: now,
      created_by: userId,
    });
    if (seasonErr) {
      summary.errors.push(`Couldn't add ${s.label}: ${seasonErr.message}`);
      continue;
    }

    const levelIds = new Map<string, string>();
    const levels = s.levels.map((l, i) => {
      const id = crypto.randomUUID();
      levelIds.set(l.label, id);
      return {
        id,
        season_id: seasonId,
        label: l.label.slice(0, 12),
        name: l.name?.slice(0, 60) ?? null,
        hidden: l.hidden,
        sort_order: (i + 1) * 10,
      };
    });
    const weekends: Record<string, unknown>[] = [];
    const games: Record<string, unknown>[] = [];
    const opponents: Record<string, unknown>[] = [];
    s.weekends.forEach((w, wi) => {
      const id = crypto.randomUUID();
      weekends.push({
        id,
        season_id: seasonId,
        starts_on: w.starts_on,
        // A weekend on the schedule runs two weeks at most.
        ends_on: w.ends_on > addDays(w.starts_on, 14) ? addDays(w.starts_on, 14) : w.ends_on,
        event: w.event.slice(0, 300),
        details: w.details,
        location: w.location,
        trip: w.trip,
        status: w.status,
        notes: w.notes,
        facility_contact_id: w.facility ? resolve(w.facility.ref) : null,
        sort_order: wi,
        created_by: userId,
        updated_by: userId,
      });
      for (const g of w.games) {
        const levelId = levelIds.get(g.label);
        if (!levelId) continue;
        games.push({ weekend_id: id, level_id: levelId, games: g.games, unsure: g.unsure, note: g.note, updated_by: userId });
      }
      w.teams.forEach((t, ti) => {
        const contactId = resolve(t.ref);
        const rows = t.levels === null ? [null] : t.levels.map((l) => levelIds.get(l) ?? null).filter(Boolean);
        for (const levelId of rows) {
          opponents.push({
            weekend_id: id,
            level_id: levelId,
            contact_id: contactId,
            name: t.name.slice(0, 120),
            status: t.status,
            our_score: t.our_score,
            their_score: t.their_score,
            sort_order: ti,
            created_by: userId,
            updated_by: userId,
          });
        }
      });
    });

    const err =
      (await insertAll(db, "hs_levels", levels)) ??
      (await insertAll(db, "hs_weekends", weekends)) ??
      (await insertAll(db, "hs_weekend_games", games)) ??
      (await insertAll(db, "hs_opponents", opponents));
    if (err) {
      await db.from("hs_seasons").delete().eq("id", seasonId);
      summary.errors.push(`Importing ${s.label} stopped, and it was taken off again: ${err}`);
      continue;
    }
    summary.seasons.push({ season: s.season, label: s.label, weekends: weekends.length, teams: opponents.length, replaced });
  }
  return summary;
}
