"use client";
// Filterable client-side list of external contacts. Free-text search across
// name, nickname, email, phone, address, account number, plus type and kind
// filters. Types are the contact_categories list, managed in Settings. Companies render with a folder vibe; people render with the
// company they work at inline.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icons } from "../../components/icons";
import { Pill } from "../../components/ui";
import type { Contact, ContactCategory, ContactKind } from "./_shared/data";
import { composeSubtitle, displayName } from "./_shared/format";

type KindFilter = "all" | ContactKind;

export function ContactsList({
  contacts,
  categories,
}: {
  contacts: Contact[];
  categories: ContactCategory[];
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [categoryId, setCategoryId] = useState<string | "all">("all");

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );
  const contactById = useMemo(
    () => new Map(contacts.map((c) => [c.id, c])),
    [contacts]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts
      .filter((c) => {
        if (kind !== "all" && c.kind !== kind) return false;
        if (categoryId !== "all" && c.category_id !== categoryId) return false;
        if (q) {
          const parent = c.parent_contact_id
            ? contactById.get(c.parent_contact_id)?.name ?? ""
            : "";
          const cat = c.category_id
            ? categoryById.get(c.category_id)?.name ?? ""
            : "";
          const hay = [
            c.name,
            c.nickname,
            c.email,
            c.phone,
            c.mobile_phone,
            c.address,
            c.account_number,
            cat,
            parent,
            ...(c.tags ?? []),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Companies sort before persons within the same name; otherwise alpha.
        if (a.kind !== b.kind) return a.kind === "company" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [contacts, query, kind, categoryId, contactById, categoryById]);

  const companyCount = useMemo(
    () => contacts.filter((c) => c.kind === "company").length,
    [contacts]
  );
  const personCount = contacts.length - companyCount;
  const countByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contacts) {
      if (c.category_id) m.set(c.category_id, (m.get(c.category_id) ?? 0) + 1);
    }
    return m;
  }, [contacts]);

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
            Vendors, photographers, facilities we rent, other programs, and anyone else outside the team.
            {" "}
            <strong style={{ color: "var(--gw-fg)" }}>{companyCount}</strong> companies ·{" "}
            <strong style={{ color: "var(--gw-fg)" }}>{personCount}</strong> people.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Search */}
        <div data-tour="contacts-search" style={{ position: "relative", maxWidth: 480 }}>
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
            placeholder="Search name, email, phone, account #, type…"
            style={{
              width: "100%",
              height: 40,
              padding: "0 12px 0 36px",
              borderRadius: 10,
              border: "1px solid var(--gw-border)",
              background: "var(--gw-bg)",
              color: "var(--gw-fg)",
              fontSize: 13,
              fontWeight: 500,
            }}
          />
        </div>

        {/* Kind filter */}
        <div data-tour="contacts-filters" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <FilterChip
            active={kind === "all"}
            label="All"
            onClick={() => setKind("all")}
          />
          <FilterChip
            active={kind === "company"}
            label="Companies"
            onClick={() => setKind("company")}
          />
          <FilterChip
            active={kind === "person"}
            label="People"
            onClick={() => setKind("person")}
          />
        </div>

        {/* Type filter */}
        {categories.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <FilterChip
              active={categoryId === "all"}
              label="All types"
              onClick={() => setCategoryId("all")}
            />
            {categories.map((c) => (
              <FilterChip
                key={c.id}
                active={categoryId === c.id}
                label={`${c.name}${countByCategory.get(c.id) ? ` · ${countByCategory.get(c.id)}` : ""}`}
                onClick={() => setCategoryId(c.id)}
              />
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div
          className="rsd-card"
          style={{ textAlign: "center", padding: "48px 24px", gap: 8 }}
        >
          <div style={{ color: "var(--gw-fg-faint)", marginBottom: 4 }}>
            <Icons.Users width={28} height={28} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "var(--gw-fg)" }}>
            {contacts.length === 0 ? "No contacts yet" : "No matches"}
          </div>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            {contacts.length === 0
              ? "Start by adding a company (a uniform vendor, a gym we rent, another program), then attach the people you work with there."
              : "Try a different search or filter."}
          </div>
          {contacts.length === 0 && (
            <div style={{ marginTop: 8 }}>
              <Link href="/portal/contacts/new" style={{ textDecoration: "none" }}>
                <Pill variant="accent" size="sm">
                  <Icons.Plus width={14} height={14} /> Add first contact
                </Pill>
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map((c) => {
            const cat = c.category_id ? categoryById.get(c.category_id) : null;
            const parent = c.parent_contact_id
              ? contactById.get(c.parent_contact_id)
              : null;
            const subtitle = composeSubtitle([
              cat?.name,
              parent?.name,
              c.email,
              c.phone,
              c.mobile_phone,
            ]);
            return (
              <Link
                key={c.id}
                href={`/portal/contacts/${c.id}`}
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
                <KindBadge kind={c.kind} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 14, color: "var(--gw-fg)" }}>
                      {displayName(c)}
                    </span>
                    {c.tags?.map((t) => (
                      <span key={t} className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>
                        {t}
                      </span>
                    ))}
                  </div>
                  {subtitle && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--gw-fg-muted)",
                        fontWeight: 500,
                        marginTop: 2,
                      }}
                    >
                      {subtitle}
                    </div>
                  )}
                </div>
                <Icons.ChevronRight width={14} height={14} />
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 100,
        background: active ? "var(--rsd-accent-fill)" : "var(--gw-bg-elev)",
        color: active ? "var(--rsd-accent-fill-on)" : "var(--gw-fg-muted)",
        border: "1px solid",
        borderColor: active ? "var(--rsd-accent-fill)" : "var(--gw-border)",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
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
