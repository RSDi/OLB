import { notFound, redirect } from "next/navigation";
import { Icons } from "../../../components/icons";
import { getSidebarLinks } from "../../../../lib/sidebar-links/queries";
import { sidebarLinkMode } from "../../../../lib/sidebar-links/url";

// A sidebar link set to open inside the portal (Settings → Sidebar Links):
// the site fills the page in a frame, with the sidebar and top bar around it.
// The top bar shows the link's label (PortalShell). The same cached list the
// sidebar uses, so RLS decides who can see it.
export default async function SidebarLinkFramePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const link = (await getSidebarLinks()).find((l) => l.id === id);
  if (!link) notFound();
  // Changed since someone bookmarked it: just go there.
  if (sidebarLinkMode(link) !== "frame") redirect(link.url);

  return (
    <div className="rsd-embed">
      <iframe
        src={link.url}
        title={link.label}
        // Scripts, forms and pop-ups work as on the site itself; it can only
        // take over the whole window when someone clicks a link that does.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-top-navigation-by-user-activation"
        allow="fullscreen; clipboard-write"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="rsd-embed-out gw-press"
        title={`Open ${link.label} in a new tab`}
      >
        <Icons.ExternalLink width={13} height={13} /> Open in a new tab
      </a>
    </div>
  );
}
