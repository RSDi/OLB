// A contact's history (contact_versions, migration 0109) in words the board
// reads: what each saved change did, field by field. Pure, so the pages and
// the tests share it. Safe to import from client components.

export type ContactVersionAction = "start" | "created" | "edited" | "deleted" | "undeleted";
export type ContactVersionSource = "app" | "import" | "restore";

export interface ContactVersion {
  id: string;
  contact_id: string;
  action: ContactVersionAction;
  // { column: [before, after] } for an edit.
  changes: Record<string, [unknown, unknown]>;
  // The whole contact afterwards.
  snapshot: Record<string, unknown>;
  source: ContactVersionSource;
  changed_by: string | null;
  impersonator_user_id: string | null;
  changed_at: string;
}

export const CONTACT_VERSION_COLUMNS =
  "id, contact_id, action, changes, snapshot, source, changed_by, impersonator_user_id, changed_at";

export interface ContactField {
  key: string;
  // As the contact form labels it.
  label: string;
  // How a sentence says it: "changed the email and phone".
  phrase: string;
  // Notes and addresses: shown as before / after blocks.
  long?: boolean;
}

// Every field the contact form edits, in its order. "Restore this version"
// puts back exactly these (a contact's kind can't change).
export const CONTACT_FIELDS: ContactField[] = [
  { key: "name", label: "Name", phrase: "name" },
  { key: "nickname", label: "Nickname", phrase: "nickname" },
  { key: "category_id", label: "Type", phrase: "type" },
  { key: "parent_contact_id", label: "Works at", phrase: "company" },
  { key: "title", label: "Role", phrase: "role" },
  { key: "city", label: "City", phrase: "city" },
  { key: "state", label: "State", phrase: "state" },
  { key: "email", label: "Email", phrase: "email" },
  { key: "phone", label: "Phone", phrase: "phone" },
  { key: "alt_email", label: "Other email", phrase: "other email" },
  { key: "mobile_phone", label: "Mobile / direct", phrase: "mobile" },
  { key: "website", label: "Website", phrase: "website" },
  { key: "address", label: "Address", phrase: "address", long: true },
  { key: "team_colors", label: "Team colors", phrase: "team colors" },
  { key: "aliases", label: "Also known as", phrase: "other names" },
  { key: "account_number", label: "Account number", phrase: "account number" },
  { key: "customer_id", label: "Customer ID", phrase: "customer ID" },
  { key: "payment_terms", label: "Payment terms", phrase: "payment terms" },
  { key: "tax_id", label: "Tax ID", phrase: "tax ID" },
  { key: "notes", label: "General notes", phrase: "notes", long: true },
  { key: "reorder_notes", label: "How to re-order", phrase: "re-order notes", long: true },
  { key: "quote_contact_notes", label: "Who to call for quotes", phrase: "quote notes", long: true },
  { key: "tags", label: "Tags", phrase: "tags" },
];

const FIELD_BY_KEY = new Map(CONTACT_FIELDS.map((f) => [f.key, f]));

export function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

export interface FieldChange {
  field: ContactField;
  before: unknown;
  after: unknown;
}

// What a version shows, field by field: for an edit, the fields that
// changed; for an added contact (or where its history starts), what it was
// saved with.
export function versionFieldChanges(v: ContactVersion): FieldChange[] {
  if (v.action === "edited") {
    return CONTACT_FIELDS.filter((f) => f.key in (v.changes ?? {})).map((f) => ({
      field: f,
      before: v.changes[f.key][0],
      after: v.changes[f.key][1],
    }));
  }
  if (v.action === "created" || v.action === "start") {
    return CONTACT_FIELDS.filter((f) => !isEmptyValue(v.snapshot?.[f.key])).map((f) => ({
      field: f,
      before: null,
      after: v.snapshot[f.key],
    }));
  }
  return [];
}

function list(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

// "changed the email and phone", "added it from the spreadsheet"… Follows
// the name of who did it.
export function versionSummary(v: ContactVersion): string {
  switch (v.action) {
    case "start":
      return "History starts here";
    case "created":
      return v.source === "import" ? "added it from the spreadsheet" : "added it";
    case "deleted":
      return "moved it to the deleted bin";
    case "undeleted":
      return "brought it back from the deleted bin";
    case "edited": {
      if (v.source === "restore") return "put back an earlier version";
      const phrases = CONTACT_FIELDS.filter((f) => f.key in (v.changes ?? {})).map((f) => f.phrase);
      if (phrases.length === 0) return v.source === "import" ? "updated it from the spreadsheet" : "saved it";
      const what = phrases.length > 4 ? `${phrases.length} fields` : `the ${list(phrases)}`;
      return v.source === "import" ? `filled in ${what} from the spreadsheet` : `changed ${what}`;
    }
  }
}

// The names ids stand for: types by id, companies by id.
export interface HistoryLookups {
  types: Map<string, string>;
  companies: Map<string, string>;
}

export function formatFieldValue(key: string, v: unknown, lookups: HistoryLookups): string {
  if (isEmptyValue(v)) return "—";
  if (key === "category_id") return lookups.types.get(String(v)) ?? "A type that's since been deleted";
  if (key === "parent_contact_id") return lookups.companies.get(String(v)) ?? "A company that's since been deleted";
  if (Array.isArray(v)) return v.map(String).join(", ");
  return String(v);
}

// The type and company ids a list of versions mentions, to look their names up.
export function referencedIds(versions: ContactVersion[]): { types: string[]; companies: string[] } {
  const types = new Set<string>();
  const companies = new Set<string>();
  const add = (key: string, v: unknown) => {
    if (typeof v !== "string" || !v) return;
    if (key === "category_id") types.add(v);
    if (key === "parent_contact_id") companies.add(v);
  };
  for (const v of versions) {
    for (const key of ["category_id", "parent_contact_id"]) {
      add(key, v.snapshot?.[key]);
      const c = v.changes?.[key];
      if (c) {
        add(key, c[0]);
        add(key, c[1]);
      }
    }
  }
  return { types: [...types], companies: [...companies] };
}

// The row "Restore this version" writes: the version's value for every
// field the form edits, as it was then.
export function restorePatch(snapshot: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const f of CONTACT_FIELDS) {
    if (!(f.key in snapshot)) continue;
    const v = snapshot[f.key];
    patch[f.key] = f.key === "tags" || f.key === "aliases" ? (Array.isArray(v) ? v : []) : v ?? null;
  }
  return patch;
}

// Would restoring this version change anything now?
export function differsFrom(snapshot: Record<string, unknown>, current: Record<string, unknown>): boolean {
  const patch = restorePatch(snapshot);
  return Object.keys(patch).some((k) => JSON.stringify(patch[k] ?? null) !== JSON.stringify(current[k] ?? null));
}

export function fieldLabel(key: string): string {
  return FIELD_BY_KEY.get(key)?.label ?? key;
}

// "Sep 30, 2026, 3:04 PM", in the club's time.
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });
}
