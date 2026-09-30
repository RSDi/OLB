"use client";
// Read-only detail view for a single contact, with edit / delete actions in
// the side column. Layout mirrors the maintenance ticket detail: main column
// has the meat (identity, contact info, account, notes), side column has
// metadata + actions.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Pill } from "../../../components/ui";
import { softDeleteContact } from "../../../../lib/contacts/actions";
import type {
  Contact,
  ContactWithRefs,
  ResolvedLink,
} from "../_shared/data";
import { displayName, externalHref, telHref } from "../_shared/format";
import { placeLabel } from "../_shared/group";
import type { ContactScheduleRow } from "../../../../lib/hs-schedule/data";
import { formatWeekendDates, weekendStatusLabel } from "../../../../lib/hs-schedule/logic";
import { seasonLabel } from "../../../../lib/planning/season";

interface Props {
  contact: ContactWithRefs;
  people: Contact[];
  // For a person: their company, and the others who work there.
  company: ContactWithRefs | null;
  coworkers: Contact[];
  links: ResolvedLink[];
  // For a program or facility: its weekends on the HS Schedule.
  history: ContactScheduleRow[];
  canDelete: boolean;
}

export function ContactDetail({ contact, people, company, coworkers, links, history, canDelete }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (
      !confirm(
        `Move "${contact.name}" to the deleted bin? Linked tickets, assets, and playbooks keep their reference but it'll be marked deleted in the contacts list.`
      )
    ) {
      return;
    }
    setDeleting(true);
    const result = await softDeleteContact(contact.id);
    setDeleting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push("/portal/contacts");
    router.refresh();
  }

  const linksByType = groupLinks(links);
  const isCompany = contact.kind === "company";

  return (
    <>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <KindBadge isCompany={isCompany} large />
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>
              {contact.name}
            </h2>
            {(contact.nickname || contact.aliases.length > 0) && (
              <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600, marginTop: 2 }}>
                Also known as {[contact.nickname, ...contact.aliases].filter(Boolean).join(", ")}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
              {contact.category && (
                <span className="rsd-chip rsd-chip-mute">{contact.category.name}</span>
              )}
              {contact.title && (
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg)" }}>{contact.title}</span>
              )}
              {contact.parent && (
                <Link
                  href={`/portal/contacts/${contact.parent.id}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--gw-fg-muted)",
                    textDecoration: "none",
                  }}
                >
                  at {company ? displayName(company) : contact.parent.name}
                  <Icons.ArrowRight width={11} height={11} />
                </Link>
              )}
              {isCompany && placeLabel(contact) && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)" }}>
                  <Icons.MapPin width={11} height={11} />
                  {placeLabel(contact)}
                </span>
              )}
              {contact.tags?.map((t) => (
                <span key={t} className="rsd-chip rsd-chip-accent" style={{ fontSize: 10 }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
        <Link
          href="/portal/contacts"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            borderRadius: 100,
            background: "var(--gw-bg-elev)",
            color: "var(--gw-fg)",
            border: "1px solid var(--gw-border)",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <Icons.ChevronLeft width={14} height={14} />
          Back to contacts
        </Link>
      </div>

      <div
        className="gw-detail-grid"
      >
        {/* Main column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Contact info */}
          <div className="rsd-card" style={{ gap: 14 }}>
            <h3 style={SECTION_TITLE}>Contact info</h3>
            <div style={GRID_2}>
              <ContactRow
                icon={<Icons.Mail width={14} height={14} />}
                label="Email"
                value={contact.email}
                href={contact.email ? `mailto:${contact.email}` : null}
              />
              <ContactRow
                icon={<Icons.Phone width={14} height={14} />}
                label="Phone"
                value={contact.phone}
                href={telHref(contact.phone)}
              />
              <ContactRow
                icon={<Icons.Phone width={14} height={14} />}
                label="Mobile / direct"
                value={contact.mobile_phone}
                href={telHref(contact.mobile_phone)}
              />
              <ContactRow
                icon={<Icons.ArrowRight width={14} height={14} />}
                label="Website"
                value={contact.website}
                href={externalHref(contact.website)}
                external
              />
              {contact.alt_email && (
                <ContactRow
                  icon={<Icons.Mail width={14} height={14} />}
                  label="Other email"
                  value={contact.alt_email}
                  href={`mailto:${contact.alt_email}`}
                />
              )}
              {contact.team_colors && (
                <ContactRow
                  icon={<Icons.Sparkles width={14} height={14} />}
                  label="Team colors"
                  value={contact.team_colors}
                  href={null}
                />
              )}
            </div>
            {contact.address && (
              <ContactRow
                icon={<Icons.MapPin width={14} height={14} />}
                label="Address"
                value={contact.address}
                href={null}
                multiline
              />
            )}
          </div>

          {/* A person's company, and who else works there */}
          {company && <WorksAtCard company={company} coworkers={coworkers} />}

          {/* Account & billing */}
          {(contact.account_number ||
            contact.customer_id ||
            contact.payment_terms ||
            contact.tax_id) && (
            <div className="rsd-card" style={{ gap: 14 }}>
              <h3 style={SECTION_TITLE}>Account & billing</h3>
              <div style={GRID_2}>
                <Field label="Account number" value={contact.account_number ?? "—"} />
                <Field label="Customer ID" value={contact.customer_id ?? "—"} />
                <Field label="Payment terms" value={contact.payment_terms ?? "—"} />
                <Field label="Tax ID" value={contact.tax_id ?? "—"} />
              </div>
            </div>
          )}

          {/* Notes blocks */}
          <NotesBlock title="General notes" body={contact.notes} />
          <NotesBlock title="How to re-order" body={contact.reorder_notes} />
          <NotesBlock title="Who to call for quotes" body={contact.quote_contact_notes} />

          {/* People at this company */}
          {isCompany && (
            <div className="rsd-card" style={{ gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={SECTION_TITLE}>
                  People at this company ({people.length})
                </h3>
                <Link
                  href={`/portal/contacts/new?kind=person&parent=${contact.id}`}
                  style={{ textDecoration: "none" }}
                >
                  <Pill variant="ghost" size="sm">
                    <Icons.Plus width={12} height={12} /> Add person
                  </Pill>
                </Link>
              </div>
              {people.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, padding: "8px 0" }}>
                  No people linked yet. Add a sales rep, account manager, or specific contact.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {people.map((child, i) => (
                    <Link
                      key={child.id}
                      href={`/portal/contacts/${child.id}`}
                      style={{
                        display: "flex",
                        gap: 12,
                        padding: "10px 0",
                        borderBottom: i < people.length - 1 ? "1px solid var(--gw-border)" : "none",
                        textDecoration: "none",
                        color: "inherit",
                        alignItems: "center",
                      }}
                    >
                      <Icons.User width={14} height={14} style={{ color: "var(--gw-fg-muted)" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>
                          {child.name}
                          {child.title && (
                            <span style={{ fontWeight: 500, color: "var(--gw-fg-muted)" }}> · {child.title}</span>
                          )}
                        </div>
                        {(child.email || child.phone || child.mobile_phone) && (
                          <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500, overflowWrap: "anywhere" }}>
                            {[child.email, child.phone, child.mobile_phone].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                      <Icons.ChevronRight width={12} height={12} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* The HS Schedule: every weekend a program came to or a facility hosted */}
          {isCompany && history.length > 0 && <ScheduleHistory rows={history} />}

          {/* Linked entities */}
          {links.length > 0 && (
            <div className="rsd-card" style={{ gap: 12 }}>
              <h3 style={SECTION_TITLE}>Used by ({links.length})</h3>
              <LinkSection
                title="Maintenance tickets"
                items={linksByType.maintenance_ticket}
              />
              <LinkSection title="PM assets" items={linksByType.pm_asset} />
              <LinkSection title="Playbooks" items={linksByType.playbook} />
            </div>
          )}
        </div>

        {/* Side column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 20 }}>
          <div className="rsd-card" style={{ gap: 12 }}>
            <h3 style={SECTION_TITLE}>Actions</h3>
            <Link href={`/portal/contacts/${contact.id}/edit`} style={{ textDecoration: "none" }}>
              <Pill variant="light" size="md" style={{ width: "100%", justifyContent: "center" }}>
                <Icons.Pencil width={14} height={14} /> Edit
              </Pill>
            </Link>
            {canDelete && (
              <Pill
                variant="ghost"
                size="md"
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  width: "100%",
                  justifyContent: "center",
                  color: "var(--gw-error)",
                  borderColor: "rgba(229,62,62,.25)",
                }}
              >
                <Icons.Trash width={14} height={14} />
                {deleting ? "Deleting…" : "Delete"}
              </Pill>
            )}
            {error && (
              <div style={{ fontSize: 12, color: "var(--gw-error)", fontWeight: 600 }}>
                {error}
              </div>
            )}
          </div>

          <div className="rsd-card" style={{ gap: 12 }}>
            <h3 style={SECTION_TITLE}>Meta</h3>
            <Field label="Kind" value={isCompany ? "Company" : "Person"} />
            <Field label="Created" value={formatDate(contact.created_at)} />
            {contact.updated_at !== contact.created_at && (
              <Field label="Updated" value={formatDate(contact.updated_at)} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const SECTION_TITLE: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 700,
  color: "var(--gw-fg-muted)",
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const GRID_2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

function groupLinks(links: ResolvedLink[]): Record<string, ResolvedLink[]> {
  const out: Record<string, ResolvedLink[]> = {
    maintenance_ticket: [],
    pm_asset: [],
    playbook: [],
  };
  for (const l of links) {
    out[l.entity_type]?.push(l);
  }
  return out;
}

function LinkSection({ title, items }: { title: string; items: ResolvedLink[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--gw-fg-muted)",
          textTransform: "uppercase",
          letterSpacing: ".04em",
        }}
      >
        {title} ({items.length})
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 8,
              background: "var(--gw-bg)",
              border: "1px solid var(--gw-border)",
              fontSize: 13,
              color: "var(--gw-fg)",
              textDecoration: "none",
            }}
          >
            <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{item.title}</span>
            {item.role && (
              <span className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>
                {item.role}
              </span>
            )}
            <Icons.ChevronRight width={12} height={12} />
          </Link>
        ))}
      </div>
    </div>
  );
}

function NotesBlock({ title, body }: { title: string; body: string | null }) {
  if (!body || !body.trim()) return null;
  return (
    <div className="rsd-card" style={{ gap: 10 }}>
      <h3 style={SECTION_TITLE}>{title}</h3>
      <div
        style={{
          fontSize: 13,
          color: "var(--gw-fg)",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
        }}
      >
        {body}
      </div>
    </div>
  );
}

function ContactRow({
  icon,
  label,
  value,
  href,
  external,
  multiline,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  href: string | null;
  external?: boolean;
  multiline?: boolean;
}) {
  if (!value) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--gw-fg-muted)",
            textTransform: "uppercase",
            letterSpacing: ".04em",
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-fg-muted)" }}>—</span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--gw-fg-muted)",
          textTransform: "uppercase",
          letterSpacing: ".04em",
        }}
      >
        {label}
      </span>
      {href ? (
        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer noopener" : undefined}
          style={{
            display: "inline-flex",
            alignItems: multiline ? "flex-start" : "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--rsd-accent)",
            textDecoration: "none",
            whiteSpace: multiline ? "pre-wrap" : "normal",
            wordBreak: "break-word",
          }}
        >
          <span style={{ color: "var(--gw-fg-muted)", flexShrink: 0 }}>{icon}</span>
          {value}
        </a>
      ) : (
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--gw-fg)",
            whiteSpace: multiline ? "pre-wrap" : "normal",
            wordBreak: "break-word",
            display: "inline-flex",
            alignItems: multiline ? "flex-start" : "center",
            gap: 6,
          }}
        >
          <span style={{ color: "var(--gw-fg-muted)", flexShrink: 0 }}>{icon}</span>
          {value}
        </span>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--gw-fg-muted)",
          textTransform: "uppercase",
          letterSpacing: ".04em",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-fg)" }}>{value}</span>
    </div>
  );
}

function KindBadge({ isCompany, large }: { isCompany: boolean; large?: boolean }) {
  const size = large ? 48 : 36;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 10,
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
      {isCompany ? (
        <Icons.Home width={large ? 22 : 16} height={large ? 22 : 16} />
      ) : (
        <Icons.User width={large ? 22 : 16} height={large ? 22 : 16} />
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// A person's company, the way its own page starts, and the others there.
function WorksAtCard({ company, coworkers }: { company: ContactWithRefs; coworkers: Contact[] }) {
  const facts = [
    company.category?.name,
    placeLabel(company),
    company.phone,
    company.email,
  ].filter(Boolean) as string[];
  return (
    <div className="rsd-card" style={{ gap: 12 }}>
      <h3 style={SECTION_TITLE}>Works at</h3>
      <Link
        href={`/portal/contacts/${company.id}`}
        style={{ display: "flex", gap: 12, alignItems: "center", textDecoration: "none", color: "inherit" }}
      >
        <KindBadge isCompany />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>
            {displayName(company)}
            {displayName(company) !== company.name && (
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)" }}> {company.name}</span>
            )}
          </div>
          {facts.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, overflowWrap: "anywhere" }}>
              {facts.join(" · ")}
            </div>
          )}
          {company.team_colors && (
            <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>Colors: {company.team_colors}</div>
          )}
        </div>
        <Icons.ChevronRight width={14} height={14} />
      </Link>
      {coworkers.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, borderTop: "1px solid var(--gw-border)", paddingTop: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
            Also at {displayName(company)} ({coworkers.length})
          </span>
          {coworkers.map((p) => (
            <Link
              key={p.id}
              href={`/portal/contacts/${p.id}`}
              style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", textDecoration: "none", color: "inherit" }}
            >
              <Icons.User width={13} height={13} style={{ color: "var(--gw-fg-muted)" }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700 }}>
                {p.name}
                {p.title && <span style={{ fontWeight: 500, color: "var(--gw-fg-muted)" }}> · {p.title}</span>}
              </span>
              <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>{p.phone ?? p.email ?? ""}</span>
              <Icons.ChevronRight width={12} height={12} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// "On the HS Schedule": newest season first, each weekend with our teams,
// whether they came (or were on the fence) and the scores.
function ScheduleHistory({ rows }: { rows: ContactScheduleRow[] }) {
  const seasons = [...new Set(rows.map((r) => r.season))];
  return (
    <div className="rsd-card" style={{ gap: 12 }} data-tour="contact-schedule-history">
      <h3 style={SECTION_TITLE}>On the HS Schedule ({rows.length})</h3>
      {seasons.map((season) => (
        <div key={season} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
            {seasonLabel(season)}
          </span>
          {rows
            .filter((r) => r.season === season)
            .map((r) => (
              <Link
                key={`${r.weekendId}-${r.as}`}
                href={`/portal/schedule?season=${season}#w-${r.weekendId}`}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "baseline",
                  flexWrap: "wrap",
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "var(--gw-bg)",
                  border: "1px solid var(--gw-border)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 84, fontVariantNumeric: "tabular-nums" }}>
                  {formatWeekendDates(r.starts_on, r.ends_on)}
                </span>
                <span style={{ flex: 1, minWidth: 140, fontSize: 13, fontWeight: 600 }}>
                  {r.event || "—"}
                  {r.status === "canceled" && (
                    <span style={{ color: "var(--gw-fg-muted)", fontWeight: 500 }}> · {weekendStatusLabel(r.status)}</span>
                  )}
                </span>
                {r.as === "facility" ? (
                  <span className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>
                    Venue
                  </span>
                ) : (
                  <>
                    {r.levels.length > 0 && (
                      <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>{r.levels.join(", ")}</span>
                    )}
                    {r.teamStatus === "tentative" && (
                      <span className="rsd-chip rsd-chip-warn" style={{ fontSize: 10 }}>
                        On the fence
                      </span>
                    )}
                    {r.teamStatus === "declined" && (
                      <span className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>
                        Not coming
                      </span>
                    )}
                    {r.results.map((x) => (
                      <span key={x} className={`rsd-chip ${/: W|^W/.test(x) ? "rsd-chip-success" : "rsd-chip-mute"}`} style={{ fontSize: 10 }}>
                        {x}
                      </span>
                    ))}
                  </>
                )}
              </Link>
            ))}
        </div>
      ))}
    </div>
  );
}
