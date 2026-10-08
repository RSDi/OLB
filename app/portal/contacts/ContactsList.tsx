"use client";
// Filterable client-side list of external contacts. Free-text search across
// name, nickname, role, email, phone, place, account number, type, company,
// tags and aliases, plus kind, type and tag filters. Types are the
// contact_categories list, managed in Settings.
//
// "All" lists each company with the people who work there under it (then
// the people on their own), so who belongs where reads at a glance.
// "Companies" lists just the companies; "People" lists the people, each with
// their company.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icons } from "../../components/icons";
import { ClearSearchButton, Pill } from "../../components/ui";
import { FilterSelect, SegButton, SegGroup } from "../../components/FilterControls";
import type { Contact, ContactCategory, ContactKind } from "./_shared/data";
import { composeSubtitle, displayName } from "./_shared/format";
import { groupContacts, placeLabel } from "./_shared/group";

type KindFilter = "all" | ContactKind;

// The tag drop-down's "All tags" (an empty value reads as unpicked).
const ALL_TAGS = "\u0000all";

// People shown under a company before "+N more".
const PEOPLE_SHOWN = 6;

export function ContactsList({
  contacts,
  categories,
  canEdit,
  canAdd = canEdit,
  readsAs = { coach: false, travel: false },
}: {
  contacts: Contact[];
  categories: ContactCategory[];
  // The board: adds, edits and sees history. Coaches only read the types
  // shared with them (RLS, 0109).
  canEdit: boolean;
  // Adds contacts: the board, and the travel coordinator for the hotels and
  // places to eat (0110).
  canAdd?: boolean;
  // Off the board: what the list holds for them, for the line under the title.
  readsAs?: { coach: boolean; travel: boolean };
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [categoryId, setCategoryId] = useState<string | "all">("all");
  const [tag, setTag] = useState<string | null>(null);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  // Does one contact match the search box and the type and tag filters?
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (c: Contact) => {
      if (categoryId !== "all" && c.category_id !== categoryId) return false;
      if (tag && !(c.tags ?? []).includes(tag)) return false;
      if (!q) return true;
      const parent = c.parent_contact_id ? contactById.get(c.parent_contact_id) : null;
      const cat = c.category_id ? categoryById.get(c.category_id)?.name ?? "" : "";
      const hay = [
        c.name,
        c.nickname,
        c.title,
        c.email,
        c.alt_email,
        c.phone,
        c.mobile_phone,
        c.address,
        c.city,
        c.state,
        c.account_number,
        cat,
        parent?.name,
        parent?.nickname,
        ...(c.tags ?? []),
        ...(c.aliases ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    };
  }, [query, categoryId, tag, contactById, categoryById]);

  const grouped = useMemo(() => groupContacts(contacts, matches), [contacts, matches]);
  const people = useMemo(
    () =>
      contacts
        .filter((c) => c.kind === "person" && matches(c))
        .sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [contacts, matches]
  );

  const companyCount = useMemo(() => contacts.filter((c) => c.kind === "company").length, [contacts]);
  const personCount = contacts.length - companyCount;
  const countByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contacts) {
      if (c.category_id) m.set(c.category_id, (m.get(c.category_id) ?? 0) + 1);
    }
    return m;
  }, [contacts]);
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contacts) for (const t of c.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [contacts]);

  const shownGroups = kind === "person" ? [] : grouped.groups;
  const shownIndependent = kind === "all" ? grouped.independent : [];
  const empty =
    kind === "person" ? people.length === 0 : shownGroups.length === 0 && shownIndependent.length === 0;

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>
            External Contacts
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            {canEdit ? "Vendors, photographers, facilities we rent, other programs, and anyone else outside the team." : listLine(readsAs)}{" "}
            <strong style={{ color: "var(--gw-fg)" }}>{companyCount}</strong> companies ·{" "}
            <strong style={{ color: "var(--gw-fg)" }}>{personCount}</strong> people.
          </p>
        </div>
        {canAdd && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {canEdit && (
              <Link href="/portal/contacts/changes" data-tour="contacts-changes" style={{ textDecoration: "none" }}>
                <Pill variant="ghost" size="md">
                  <Icons.Clock width={14} height={14} />
                  Recent changes
                </Pill>
              </Link>
            )}
            <Link
              href="/portal/contacts/new"
              data-tour="contacts-new"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 18px",
                borderRadius: 100,
                background: "var(--rsd-accent-fill)",
                color: "var(--rsd-accent-fill-on)",
                border: "1px solid var(--rsd-accent-fill)",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              <Icons.Plus width={14} height={14} />
              New contact
            </Link>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div data-tour="contacts-search" style={{ position: "relative", flex: "1 1 280px", maxWidth: 480 }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--gw-fg-muted)",
                display: "flex",
              }}
            >
              <Icons.Search width={14} height={14} />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search contacts"
              aria-label="Search external contacts"
              style={{
                width: "100%",
                height: 40,
                padding: "0 40px 0 36px",
                borderRadius: 10,
                border: "1px solid var(--gw-border)",
                background: "var(--gw-bg)",
                color: "var(--gw-fg)",
                fontSize: 13,
                fontWeight: 500,
              }}
            />
            {query && <ClearSearchButton onClear={() => setQuery("")} />}
          </div>
          <SegGroup label="Show companies or people" data-tour="contacts-view">
            <SegButton label="All" active={kind === "all"} onClick={() => setKind("all")} />
            <SegButton label="Companies" active={kind === "company"} onClick={() => setKind("company")} />
            <SegButton label="People" active={kind === "person"} onClick={() => setKind("person")} />
          </SegGroup>
        </div>

        {(categories.length > 0 || tagCounts.length > 0) && (
          <div data-tour="contacts-filters" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {categories.length > 0 && (
              <FilterSelect
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                aria-label="Show a type"
                grow
                active={categoryId !== "all"}
              >
                <option value="all">All types</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({countByCategory.get(c.id) ?? 0})
                  </option>
                ))}
              </FilterSelect>
            )}
            {tagCounts.length > 0 && (
              <FilterSelect
                value={tag ?? ALL_TAGS}
                onChange={(e) => setTag(e.target.value === ALL_TAGS ? null : e.target.value)}
                aria-label="Show a tag"
                grow
                data-tour="contacts-tags"
                active={tag !== null}
              >
                <option value={ALL_TAGS}>All tags</option>
                {tagCounts.map(([t, n]) => (
                  <option key={t} value={t}>
                    {t} ({n})
                  </option>
                ))}
              </FilterSelect>
            )}
          </div>
        )}
      </div>

      {empty ? (
        <div className="rsd-card" style={{ textAlign: "center", padding: "48px 24px", gap: 8 }}>
          <div style={{ color: "var(--gw-fg-faint)", marginBottom: 4 }}>
            <Icons.Users width={28} height={28} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "var(--gw-fg)" }}>
            {contacts.length === 0 ? "No contacts yet" : "No matches"}
          </div>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            {contacts.length > 0
              ? "Try a different search or filter."
              : canEdit
                ? "Start by adding a company (a uniform vendor, a gym we rent, another program), then attach the people you work with there."
                : canAdd
                  ? "No hotels or places to eat yet. Add one with New contact, as a Hotels or Food company."
                  : "Nothing is shared with coaches yet. The board picks which types coaches see."}
          </div>
          {contacts.length === 0 && canEdit && (
            <div style={{ marginTop: 8, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/portal/contacts/new" style={{ textDecoration: "none" }}>
                <Pill variant="accent" size="sm">
                  <Icons.Plus width={14} height={14} /> Add first contact
                </Pill>
              </Link>
            </div>
          )}
        </div>
      ) : kind === "person" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {people.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              company={p.parent_contact_id ? contactById.get(p.parent_contact_id) ?? null : null}
              category={p.category_id ? categoryById.get(p.category_id)?.name ?? null : null}
            />
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {shownGroups.map((g) => (
            <CompanyCard
              key={g.company.id}
              company={g.company}
              people={kind === "company" ? [] : g.people}
              total={g.total}
              filtered={!g.companyMatches}
              category={g.company.category_id ? categoryById.get(g.company.category_id)?.name ?? null : null}
            />
          ))}
          {shownIndependent.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: shownGroups.length ? 8 : 0 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--gw-fg-muted)",
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                  padding: "0 4px",
                }}
              >
                People on their own ({shownIndependent.length})
              </span>
              {shownIndependent.map((p) => (
                <PersonCard
                  key={p.id}
                  person={p}
                  company={null}
                  category={p.category_id ? categoryById.get(p.category_id)?.name ?? null : null}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// A company, with the people who work there listed under it.
function CompanyCard({
  company,
  people,
  total,
  filtered,
  category,
}: {
  company: Contact;
  people: Contact[];
  total: number;
  // The search matched some of its people, not the company itself.
  filtered: boolean;
  category: string | null;
}) {
  const name = displayName(company);
  const fullName = name !== company.name ? company.name : null;
  const subtitle = composeSubtitle([
    category,
    placeLabel(company),
    company.email,
    company.phone,
    total > 0 ? `${total} ${total === 1 ? "person" : "people"}` : null,
  ]);
  const shown = people.slice(0, PEOPLE_SHOWN);
  const more = people.length - shown.length;
  return (
    <div className="rsd-card" data-tour="contacts-card" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
      <Link
        href={`/portal/contacts/${company.id}`}
        className="rsd-dash-row"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "12px 16px",
          textDecoration: "none",
          color: "inherit",
          borderRadius: 0,
        }}
      >
        <KindBadge kind="company" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: "var(--gw-fg)" }}>{name}</span>
            {fullName && <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>{fullName}</span>}
            {company.tags?.map((t) => (
              <span key={t} className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>
                {t}
              </span>
            ))}
          </div>
          {subtitle && (
            <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
        <Icons.ChevronRight width={14} height={14} />
      </Link>
      {shown.length > 0 && (
        <div style={{ borderTop: "1px solid var(--gw-border)", background: "var(--gw-bg)", padding: "4px 0" }}>
          {filtered && (
            <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600, padding: "6px 16px 2px 66px" }}>
              {people.length} of {total} {total === 1 ? "person" : "people"} here match
            </div>
          )}
          {shown.map((p) => (
            <Link
              key={p.id}
              href={`/portal/contacts/${p.id}`}
              className="rsd-dash-row"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 16px 8px 66px",
                textDecoration: "none",
                color: "inherit",
                borderRadius: 0,
              }}
            >
              <Icons.User width={13} height={13} style={{ color: "var(--gw-fg-muted)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {displayName(p)}
                  {p.title && <span style={{ fontWeight: 500, color: "var(--gw-fg-muted)" }}> · {p.title}</span>}
                </div>
                {(p.email || p.phone || p.mobile_phone) && (
                  <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500, overflowWrap: "anywhere" }}>
                    {composeSubtitle([p.email, p.phone, p.mobile_phone])}
                  </div>
                )}
              </div>
              <Icons.ChevronRight width={12} height={12} style={{ color: "var(--gw-fg-muted)" }} />
            </Link>
          ))}
          {more > 0 && (
            <Link
              href={`/portal/contacts/${company.id}`}
              style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--rsd-accent)", padding: "6px 16px 8px 66px", textDecoration: "none" }}
            >
              + {more} more at {name}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// A person, with the company they work at.
function PersonCard({ person, company, category }: { person: Contact; company: Contact | null; category: string | null }) {
  const subtitle = composeSubtitle([person.title, category, person.email, person.phone, person.mobile_phone]);
  return (
    <Link
      href={`/portal/contacts/${person.id}`}
      data-tour="contacts-card"
      className="rsd-card"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: "12px 16px",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <KindBadge kind="person" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--gw-fg)" }}>{displayName(person)}</span>
          {company && (
            <span
              className="rsd-chip"
              style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4, background: "var(--gw-bg)" }}
              title={company.name}
            >
              <Icons.Home width={11} height={11} />
              {displayName(company)}
            </span>
          )}
          {person.tags?.map((t) => (
            <span key={t} className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>
              {t}
            </span>
          ))}
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 2, overflowWrap: "anywhere" }}>
            {subtitle}
          </div>
        )}
      </div>
      <Icons.ChevronRight width={14} height={14} />
    </Link>
  );
}

function KindBadge({ kind }: { kind: ContactKind }) {
  const isCompany = kind === "company";
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        background: isCompany ? "var(--gw-fg)" : "var(--gw-bg-elev)",
        color: isCompany ? "var(--gw-bg)" : "var(--gw-fg-muted)",
        border: "1px solid",
        borderColor: isCompany ? "var(--gw-fg)" : "var(--gw-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {isCompany ? <Icons.Home width={16} height={16} /> : <Icons.User width={16} height={16} />}
    </div>
  );
}

// Under the title, for someone off the board: what they can see here.
function listLine(readsAs: { coach: boolean; travel: boolean }): string {
  const parts = [
    readsAs.coach ? "the programs, gyms and referees the board shares with coaches" : null,
    readsAs.travel ? "the hotels and places to eat you keep for the team's travel" : null,
  ].filter(Boolean) as string[];
  const line = parts.join(", and ") || "the contacts the board shares with you";
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
}
