import Link from "next/link";
import { Icons } from "../../../components/icons";
import {
  loadContactCategories,
  loadContacts,
  loadContactsViewer,
} from "../_shared/data";
import { ContactForm } from "../_shared/ContactForm";

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; parent?: string }>;
}) {
  await loadContactsViewer();
  const { kind, parent } = await searchParams;

  const [categories, companies] = await Promise.all([
    loadContactCategories(),
    loadContacts({ kind: "company" }),
  ]);

  const initialKind = kind === "person" ? "person" : "company";
  const initialParentId = parent ?? null;

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>
            New contact
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            Add a company (a vendor, a facility, another program) or someone who works there.
          </p>
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

      <ContactForm
        categories={categories}
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        initialKind={initialKind}
        initialParentId={initialParentId}
      />
    </>
  );
}
