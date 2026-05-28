// Shared types + server-side loaders for all /portal/contacts/* views.
// Mirrors the convention used by /portal/directory/_shared/data.ts.
//
// Visibility: every loader here returns staff-only data (RLS filters out
// non-staff callers). loadViewer() is the access guard that redirects
// non-staff to /portal before they see anything.

import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { getViewer } from "../../../../lib/auth/viewer";

export type ContactKind = "company" | "person";

export type ContactLinkEntityType =
  | "maintenance_ticket"
  | "pm_asset"
  | "playbook";

export interface ContactCategory {
  id: string;
  name: string;
  slug: string | null;
  sort_order: number;
}

export interface Contact {
  id: string;
  kind: ContactKind;
  parent_contact_id: string | null;
  category_id: string | null;
  name: string;
  nickname: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  website: string | null;
  address: string | null;
  account_number: string | null;
  customer_id: string | null;
  payment_terms: string | null;
  tax_id: string | null;
  notes: string | null;
  reorder_notes: string | null;
  quote_contact_notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface ContactWithRefs extends Contact {
  category: ContactCategory | null;
  parent: { id: string; name: string } | null;
}

export interface ContactLink {
  id: string;
  contact_id: string;
  entity_type: ContactLinkEntityType;
  entity_id: string;
  role: string | null;
  created_at: string;
}

export interface ContactsViewer {
  memberId: string;
  userId: string;
  isStaff: boolean;
  isSuperAdmin: boolean;
}

// Access guard. The whole /portal/contacts section is staff-only — regular
// approved members get redirected back to /portal so they can't even land
// on the page (RLS would return zero rows anyway, but this short-circuits
// rendering).
export async function loadContactsViewer(): Promise<ContactsViewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isStaff) redirect("/portal");
  return {
    memberId: viewer.memberId,
    userId: viewer.userId,
    isStaff: viewer.isStaff,
    isSuperAdmin: viewer.isSuperAdmin,
  };
}

const CONTACT_COLUMNS =
  "id, kind, parent_contact_id, category_id, name, nickname, email, phone, mobile_phone, website, address, account_number, customer_id, payment_terms, tax_id, notes, reorder_notes, quote_contact_notes, tags, created_at, updated_at";

// All contacts, ordered by name. The filter args narrow the result set
// without forcing the caller to know the underlying column names.
export async function loadContacts(opts?: {
  kind?: ContactKind;
  categoryId?: string;
  parentId?: string | null;
}): Promise<Contact[]> {
  const supabase = await createClient();
  let q = supabase
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .is("deleted_at", null);
  if (opts?.kind) q = q.eq("kind", opts.kind);
  if (opts?.categoryId) q = q.eq("category_id", opts.categoryId);
  if (opts?.parentId !== undefined) {
    if (opts.parentId === null) q = q.is("parent_contact_id", null);
    else q = q.eq("parent_contact_id", opts.parentId);
  }
  const { data } = await q.order("name", { ascending: true });
  return (data as Contact[] | null) ?? [];
}

// Single contact with category + parent company resolved (1 query, 2 joins).
export async function loadContact(id: string): Promise<ContactWithRefs | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select(
      `${CONTACT_COLUMNS},
       category:contact_categories(id, name, slug, sort_order),
       parent:contacts!parent_contact_id(id, name)`
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as unknown as ContactWithRefs | null) ?? null;
}

export async function loadContactCategories(): Promise<ContactCategory[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contact_categories")
    .select("id, name, slug, sort_order")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return (data as ContactCategory[] | null) ?? [];
}

// Children of a company contact (the sales reps / account managers).
export async function loadChildContacts(parentId: string): Promise<Contact[]> {
  return loadContacts({ parentId });
}

// Picker option shape — what the LinkedContacts widget needs to render
// the "Attach" dropdown without fetching extra data.
export interface ContactPickerOption {
  id: string;
  name: string;
  kind: ContactKind;
  parentName: string | null;
  categoryName: string | null;
}

// Fetch every active contact in a denormalized shape suitable for the
// LinkedContacts picker. Used by the maintenance ticket, PM asset, and
// playbook detail pages.
export async function loadContactPickerOptions(): Promise<ContactPickerOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select(
      `id, name, kind,
       category:contact_categories(name),
       parent:contacts!parent_contact_id(name)`
    )
    .is("deleted_at", null)
    .order("name", { ascending: true });
  const rows = (data as unknown as
    | {
        id: string;
        name: string;
        kind: ContactKind;
        category: { name: string } | null;
        parent: { name: string } | null;
      }[]
    | null) ?? [];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    parentName: r.parent?.name ?? null,
    categoryName: r.category?.name ?? null,
  }));
}

// Linked-contacts widget data — denormalized rows ready to render.
// Wraps loadLinkedContacts() with the extra join data the UI shows.
export interface LinkedContactWidgetRow {
  linkId: string;
  contactId: string;
  contactName: string;
  contactKind: ContactKind;
  parentName: string | null;
  categoryName: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
}

export async function loadLinkedContactsForEntity(
  entityType: ContactLinkEntityType,
  entityId: string
): Promise<LinkedContactWidgetRow[]> {
  const supabase = await createClient();
  const { data: linkRows } = await supabase
    .from("contact_links")
    .select("id, contact_id, role, created_at")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });
  const links =
    (linkRows as
      | { id: string; contact_id: string; role: string | null; created_at: string }[]
      | null) ?? [];
  if (links.length === 0) return [];

  const ids = [...new Set(links.map((l) => l.contact_id))];
  const { data: contactRows } = await supabase
    .from("contacts")
    .select(
      `id, name, kind, email, phone,
       category:contact_categories(name),
       parent:contacts!parent_contact_id(name)`
    )
    .in("id", ids)
    .is("deleted_at", null);
  const contacts =
    (contactRows as unknown as
      | {
          id: string;
          name: string;
          kind: ContactKind;
          email: string | null;
          phone: string | null;
          category: { name: string } | null;
          parent: { name: string } | null;
        }[]
      | null) ?? [];
  const byId = new Map(contacts.map((c) => [c.id, c]));

  return links
    .filter((l) => byId.has(l.contact_id))
    .map((l) => {
      const c = byId.get(l.contact_id)!;
      return {
        linkId: l.id,
        contactId: c.id,
        contactName: c.name,
        contactKind: c.kind,
        parentName: c.parent?.name ?? null,
        categoryName: c.category?.name ?? null,
        email: c.email,
        phone: c.phone,
        role: l.role,
      };
    });
}

// Resolve every contact linked to a specific entity (a maintenance ticket,
// a PM asset, a playbook). Returns the link row + the full contact for
// rendering.
export async function loadLinkedContacts(
  entityType: ContactLinkEntityType,
  entityId: string
): Promise<{ link: ContactLink; contact: Contact }[]> {
  const supabase = await createClient();
  const { data: linkRows } = await supabase
    .from("contact_links")
    .select("id, contact_id, entity_type, entity_id, role, created_at")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });
  const links = (linkRows as ContactLink[] | null) ?? [];
  if (links.length === 0) return [];

  const ids = [...new Set(links.map((l) => l.contact_id))];
  const { data: contactRows } = await supabase
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .in("id", ids)
    .is("deleted_at", null);
  const contacts = (contactRows as Contact[] | null) ?? [];
  const byId = new Map(contacts.map((c) => [c.id, c]));

  return links
    .filter((l) => byId.has(l.contact_id))
    .map((l) => ({ link: l, contact: byId.get(l.contact_id)! }));
}

// Inverse: every entity a given contact is linked to. Used on the contact
// detail page to show "Used by these tickets / assets / playbooks."
export async function loadContactLinks(
  contactId: string
): Promise<ContactLink[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contact_links")
    .select("id, contact_id, entity_type, entity_id, role, created_at")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });
  return (data as ContactLink[] | null) ?? [];
}

export interface ResolvedLink {
  id: string;
  entity_type: ContactLinkEntityType;
  entity_id: string;
  role: string | null;
  title: string;
  href: string;
}

// For the contact detail page — resolves each link's target entity to a
// title + href the UI can render. Missing/deleted targets are dropped
// (rather than appearing as broken links).
export async function loadResolvedLinksForContact(
  contactId: string
): Promise<ResolvedLink[]> {
  const links = await loadContactLinks(contactId);
  if (links.length === 0) return [];

  const supabase = await createClient();
  const byType = new Map<ContactLinkEntityType, string[]>();
  for (const l of links) {
    const arr = byType.get(l.entity_type) ?? [];
    arr.push(l.entity_id);
    byType.set(l.entity_type, arr);
  }

  const titleByKey = new Map<string, { title: string; href: string }>();
  const key = (t: string, id: string) => `${t}:${id}`;

  const ticketIds = byType.get("maintenance_ticket");
  if (ticketIds && ticketIds.length > 0) {
    const { data } = await supabase
      .from("maintenance_requests")
      .select("id, description")
      .in("id", ticketIds)
      .is("deleted_at", null);
    for (const r of (data as { id: string; description: string }[] | null) ?? []) {
      titleByKey.set(key("maintenance_ticket", r.id), {
        title: r.description?.slice(0, 80) ?? "Ticket",
        href: `/portal/maintenance/${r.id}`,
      });
    }
  }

  const assetIds = byType.get("pm_asset");
  if (assetIds && assetIds.length > 0) {
    const { data } = await supabase
      .from("assets")
      .select("id, name")
      .in("id", assetIds)
      .is("deleted_at", null);
    for (const r of (data as { id: string; name: string }[] | null) ?? []) {
      titleByKey.set(key("pm_asset", r.id), {
        title: r.name,
        href: `/portal/pm/assets/${r.id}`,
      });
    }
  }

  const playbookIds = byType.get("playbook");
  if (playbookIds && playbookIds.length > 0) {
    const { data } = await supabase
      .from("playbooks")
      .select("id, title")
      .in("id", playbookIds)
      .is("deleted_at", null);
    for (const r of (data as { id: string; title: string }[] | null) ?? []) {
      titleByKey.set(key("playbook", r.id), {
        title: r.title,
        href: `/portal/docs/${r.id}`,
      });
    }
  }

  return links
    .map<ResolvedLink | null>((l) => {
      const tk = titleByKey.get(key(l.entity_type, l.entity_id));
      if (!tk) return null;
      return {
        id: l.id,
        entity_type: l.entity_type,
        entity_id: l.entity_id,
        role: l.role,
        title: tk.title,
        href: tk.href,
      };
    })
    .filter((l): l is ResolvedLink => l !== null);
}
