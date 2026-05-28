"use server";

// Server actions for contacts CRUD + contact_links join management.
// All mutations require staff (delete is super-admin only); RLS enforces
// this server-side so even if the UI gate is bypassed the DB rejects the
// write.

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";

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

export async function createContact(
  input: ContactInput
): Promise<ContactActionResult> {
  const err = validate(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data, error } = await supabase
    .from("contacts")
    .insert({ ...toRow(input), created_by: user.id })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Failed to create contact." };
  }

  revalidatePath("/portal/contacts");
  return { success: true, contactId: data.id };
}

export async function updateContact(
  contactId: string,
  input: ContactInput
): Promise<ContactActionResult> {
  const err = validate(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update(toRow(input))
    .eq("id", contactId);

  if (error) return { error: error.message };

  revalidatePath("/portal/contacts");
  revalidatePath(`/portal/contacts/${contactId}`);
  return { success: true, contactId };
}

export async function softDeleteContact(
  contactId: string
): Promise<ContactActionResult> {
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
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ deleted_at: null })
    .eq("id", contactId);
  if (error) return { error: error.message };

  revalidatePath("/portal/contacts");
  return { success: true };
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
    revalidatePath(`/portal/maintenance/${entityId}`);
    revalidatePath("/portal/maintenance");
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
