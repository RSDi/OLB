import Link from "next/link";
import { notFound } from "next/navigation";
import { Icons } from "../../../../components/icons";
import {
  loadContact,
  loadContactCategories,
  loadContacts,
  loadContactsViewer,
} from "../../_shared/data";
import { ContactForm } from "../../_shared/ContactForm";

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await loadContactsViewer({ board: true });
  const { id } = await params;

  const [contact, categories, companies] = await Promise.all([
    loadContact(id),
    loadContactCategories(),
    loadContacts({ kind: "company" }),
  ]);
  if (!contact) notFound();

  // Don't show this contact itself as a parent option (would create a cycle).
  const parentOptions = companies
    .filter((c) => c.id !== id)
    .map((c) => ({ id: c.id, name: c.name }));

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
            Edit contact
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            {contact.name}
          </p>
        </div>
        <Link
          href={`/portal/contacts/${id}`}
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
          Back to contact
        </Link>
      </div>

      <ContactForm
        categories={categories}
        companies={parentOptions}
        initial={contact}
      />
    </>
  );
}
