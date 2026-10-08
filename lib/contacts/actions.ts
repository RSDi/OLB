"use server";

// Server actions for contacts CRUD + contact_links join management.
// Mutations require staff (delete is super-admin only), except that the
// travel coordinator (0110) adds and edits the hotels and places to eat; RLS
// enforces this server-side so even if the UI gate is bypassed the DB
// rejects the write.

import { revalidatePath } from "next/cache";
import { requireContactEditor, requireStaff } from "../auth/guards";
import { createClient } from "../supabase/server";
import { differsFrom, restorePatch } from "./history";

export interface ContactActionResult {
  success?: boolean;
  error?: string;
  contactId?: string;
}

export interface ContactInput {
  kind: "company" | "person";
  parentContactId?: string | null;
  categoryId?: string | null;
  name: string;
  nickname?: string | null;
  email?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  website?: string | null;
  address?: string | null;
  accountNumber?: string | null;
  customerId?: string | null;
  paymentTerms?: string | null;
  taxId?: string | null;
  notes?: string | null;
  reorderNotes?: string | null;
  quoteContactNotes?: string | null;
  tags?: string[];
  // 0107.
  title?: string | null;
  city?: string | null;
  state?: string | null;
  altEmail?: string | null;
  teamColors?: string | null;
  aliases?: string[];
}

function emptyToNull(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function validate(input: ContactInput): string | null {
  if (!input.name || !input.name.trim()) return "Name is required.";
  if (input.kind !== "company" && input.kind !== "person") {
    return "Kind must be 'company' or 'person'.";
  }
  if (input.kind === "company" && input.parentContactId) {
    return "A company cannot have a parent contact.";
  }
  return null;
}

function toRow(input: ContactInput) {
  return {
    kind: input.kind,
    parent_contact_id: input.parentContactId ?? null,
    category_id: input.categoryId ?? null,
    name: input.name.trim(),
    nickname: emptyToNull(input.nickname),
    email: emptyToNull(input.email),
    phone: emptyToNull(input.phone),
    mobile_phone: emptyToNull(input.mobilePhone),
    website: emptyToNull(input.website),
    address: emptyToNull(input.address),
    account_number: emptyToNull(input.accountNumber),
    customer_id: emptyToNull(input.customerId),
    payment_terms: emptyToNull(input.paymentTerms),
    tax_id: emptyToNull(input.taxId),
    notes: emptyToNull(input.notes),
    reorder_notes: emptyToNull(input.reorderNotes),
    quote_contact_notes: emptyToNull(input.quoteContactNotes),
    tags: input.tags ?? [],
  };
}

// The 0107 fields. A person has a role; a company has a place and colors.
function programFields(input: ContactInput) {
  const isCompany = input.kind === "company";
  return {
    title: isCompany ? null : emptyToNull(input.title),
    city: isCompany ? emptyToNull(input.city) : null,
    state: isCompany ? emptyToNull(input.state)?.toUpperCase() ?? null : null,
    alt_email: emptyToNull(input.altEmail),
    team_colors: isCompany ? emptyToNull(input.teamColors) : null,
    aliases: (input.aliases ?? []).map((a) => a.trim()).filter(Boolean),
  };
}

// Before migration 0107 the database doesn't have those columns: save the
// rest rather than failing.
function missingColumn(error: { message?: string; code?: string } | null): boolean {
  return !!error && (error.code === "42703" || error.code === "PGRST204" || /column/i.test(error.message ?? ""));
}

// The travel coordinator (0110) keeps the hotels and places to eat: a
// contact of a travel type, or a person at one. RLS enforces it; this says so
// plainly instead of a policy error.
async function travelOnly(supabase: Awaited<ReturnType<typeof createClient>>, input: ContactInput): Promise<string | null> {
  const { data } = await supabase.rpc("contact_is_travel", {
    p_category_id: input.categoryId ?? null,
    p_parent_contact_id: input.kind === "person" ? input.parentContactId ?? null : null,
  });
  return data === true
    ? null
    : "You can add and change hotels and places to eat: give it the Hotels or Food type, or put a person under a hotel or restaurant.";
}

export async function createContact(
  input: ContactInput
): Promise<ContactActionResult> {
  const gate = await requireContactEditor();
  if ("error" in gate) return { error: gate.error };
  const err = validate(input);
  if (err) return { error: err };

  const supabase = await createClient();
  if (!gate.isStaff) {
    const travel = await travelOnly(supabase, input);
    if (travel) return { error: travel };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  let { data, error } = await supabase
    .from("contacts")
    .insert({ ...toRow(input), ...programFields(input), created_by: user.id })
    .select("id")
    .single();
  if (missingColumn(error)) {
    ({ data, error } = await supabase
      .from("contacts")
      .insert({ ...toRow(input), created_by: user.id })
      .select("id")
      .single());
  }

  if (error || !data) {
    return { error: error?.message ?? "Failed to create contact." };
  }

  revalidatePath("/portal/contacts");
  return { success: true, contactId: data.id };
}

// `openedAt` is the contact's updated_at when the form opened: the save only
// goes through if nobody has saved it since, so two people editing at once
// can't quietly overwrite each other.
export async function updateContact(
  contactId: string,
  input: ContactInput,
  openedAt?: string
): Promise<ContactActionResult> {
  const gate = await requireContactEditor();
  if ("error" in gate) return { error: gate.error };
  const err = validate(input);
  if (err) return { error: err };

  const supabase = await createClient();
  if (!gate.isStaff) {
    const travel = await travelOnly(supabase, input);
    if (travel) return { error: travel };
  }
  const save = (row: Record<string, unknown>) => {
    let q = supabase.from("contacts").update(row).eq("id", contactId);
    if (openedAt) q = q.eq("updated_at", openedAt);
    return q.select("id");
  };
  let { data, error } = await save({ ...toRow(input), ...programFields(input) });
  if (missingColumn(error)) ({ data, error } = await save(toRow(input)));

  if (error) return { error: error.message };
  if (openedAt && (data ?? []).length === 0) {
    return {
      error:
        "Someone else saved this contact after you opened it, so your changes weren't saved. Copy anything you typed, reload the page to see theirs (History shows what they changed), and make yours again.",
    };
  }

  revalidatePath("/portal/contacts");
  revalidatePath(`/portal/contacts/${contactId}`);
  return { success: true, contactId };
}

export async function softDeleteContact(
  contactId: string
): Promise<ContactActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", contactId);
  if (error) return { error: error.message };

  revalidatePath("/portal/contacts");
  return { success: true };
}

export async function restoreContact(
  contactId: string
): Promise<ContactActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ deleted_at: null })
    .eq("id", contactId);
  if (error) return { error: error.message };

  revalidatePath("/portal/contacts");
  return { success: true };
}

// "Restore this version" on a contact's History (contact_versions, 0109):
// every field the form edits goes back to how that version had it. It's
// saved as a new change, marked as a restore, so it can be undone the same
// way. A type or company that has since been deleted stays as it is now.
export async function restoreContactVersion(versionId: string): Promise<ContactActionResult> {
  // The board, or anyone with the External Contacts permission (0123); not
  // the travel coordinator, who doesn't see History.
  const gate = await requireContactEditor();
  if ("error" in gate) return { error: gate.error };
  if (!gate.isStaff) return { error: "Only the board can restore a contact's history." };
  const supabase = await createClient({ changeSource: "restore" });

  const { data: v } = await supabase.from("contact_versions").select("contact_id, snapshot").eq("id", versionId).maybeSingle();
  if (!v) return { error: "That version isn't there any more." };
  const { contact_id: contactId, snapshot } = v as { contact_id: string; snapshot: Record<string, unknown> };
  const { data: current } = await supabase.from("contacts").select("*").eq("id", contactId).is("deleted_at", null).maybeSingle();
  if (!current) return { error: "This contact is in the deleted bin. Bring it back first." };
  const now = current as Record<string, unknown>;
  if (!differsFrom(snapshot, now)) return { success: true, contactId };

  const patch = restorePatch(snapshot);
  const [{ data: type }, { data: company }] = await Promise.all([
    patch.category_id
      ? supabase.from("contact_categories").select("id").eq("id", patch.category_id as string).is("deleted_at", null).maybeSingle()
      : Promise.resolve({ data: null }),
    patch.parent_contact_id
      ? supabase.from("contacts").select("id").eq("id", patch.parent_contact_id as string).is("deleted_at", null).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (patch.category_id && !type) patch.category_id = now.category_id ?? null;
  if (patch.parent_contact_id && !company) patch.parent_contact_id = now.parent_contact_id ?? null;

  const { error } = await supabase.from("contacts").update(patch).eq("id", contactId);
  if (error) return { error: error.message };

  revalidatePath("/portal/contacts");
  revalidatePath(`/portal/contacts/${contactId}`);
  return { success: true, contactId };
}

// ---------------------------------------------------------------------------
// contact_links — polymorphic join management.
// ---------------------------------------------------------------------------

export type ContactLinkEntityType =
  | "maintenance_ticket"
  | "pm_asset"
  | "playbook";

export interface ContactLinkResult {
  success?: boolean;
  error?: string;
  linkId?: string;
}

const VALID_ENTITY_TYPES: ContactLinkEntityType[] = [
  "maintenance_ticket",
  "pm_asset",
  "playbook",
];

function entityRevalidate(entityType: ContactLinkEntityType, entityId: string) {
  if (entityType === "maintenance_ticket") {
    revalidatePath(`/portal/tasks/${entityId}`);
    revalidatePath("/portal/tasks");
  } else if (entityType === "pm_asset") {
    revalidatePath(`/portal/pm/assets/${entityId}`);
  } else if (entityType === "playbook") {
    revalidatePath(`/portal/docs/${entityId}`);
  }
}

export async function linkContactToEntity(input: {
  contactId: string;
  entityType: ContactLinkEntityType;
  entityId: string;
  role?: string | null;
}): Promise<ContactLinkResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  if (!VALID_ENTITY_TYPES.includes(input.entityType)) {
    return { error: "Unsupported entity type." };
  }
  if (!input.contactId || !input.entityId) {
    return { error: "Contact and entity are required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data, error } = await supabase
    .from("contact_links")
    .insert({
      contact_id: input.contactId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      role: emptyToNull(input.role ?? null),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    // Unique violation — the link already exists. Silently treat as success.
    if (error.code === "23505") return { success: true };
    return { error: error.message };
  }

  entityRevalidate(input.entityType, input.entityId);
  revalidatePath(`/portal/contacts/${input.contactId}`);
  return { success: true, linkId: data?.id };
}

export async function unlinkContactFromEntity(input: {
  linkId: string;
}): Promise<ContactLinkResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  if (!input.linkId) return { error: "Missing link id." };

  const supabase = await createClient();

  // Read the row first so we know what to revalidate after the delete.
  const { data: existing } = await supabase
    .from("contact_links")
    .select("contact_id, entity_type, entity_id")
    .eq("id", input.linkId)
    .maybeSingle();

  const { error } = await supabase
    .from("contact_links")
    .delete()
    .eq("id", input.linkId);
  if (error) return { error: error.message };

  if (existing) {
    entityRevalidate(
      existing.entity_type as ContactLinkEntityType,
      existing.entity_id
    );
    revalidatePath(`/portal/contacts/${existing.contact_id}`);
  }
  return { success: true };
}
