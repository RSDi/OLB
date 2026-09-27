"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import { canEditSettings, isStaff, isSuperAdmin, type MemberLike } from "../../../lib/auth/permissions";
import { seesFullUi } from "../../../lib/auth/feature-preview";
import { MembersTab } from "./MembersTab";
import { AreasTab } from "./AreasTab";
import { PrioritiesTab } from "./PrioritiesTab";
import { AssetsTab } from "./AssetsTab";
import { TypesTab } from "./TypesTab";
import { SuppliesTab } from "./SuppliesTab";
import { TeamsSettingsTab } from "./TeamsSettingsTab";
import { VolunteerRolesTab } from "./VolunteerRolesTab";
import { EventCategoriesTab } from "./EventCategoriesTab";
import { TaskCategoriesTab } from "./TaskCategoriesTab";
import { PlaybooksTab } from "./PlaybooksTab";
import { ClosuresTab } from "./ClosuresTab";
import { ContactCategoriesTab } from "./ContactCategoriesTab";
import { AuditLogTab } from "./AuditLogTab";
import { DeletedTab } from "./DeletedTab";
import { IntegrationsTab } from "./IntegrationsTab";
import { SidebarLinksTab } from "./SidebarLinksTab";
import { RequirementsTab } from "./RequirementsTab";

// Staged rollout: the tabs released to everyone who can open Settings, and
// the extra ones released to super-admins only. The rest stay with the
// accounts in lib/auth/feature-preview.ts.
const RELEASED_TABS = new Set<string>(["members", "teams", "volunteer_roles", "requirements"]);
const SUPER_ADMIN_RELEASED_TABS = new Set<string>([
  "playbooks",
  "sidebar_links",
  "contact_categories",
  "audit_log",
]);

type Tab =
  | "members"
  | "areas"
  | "priorities"
  | "assets"
  | "types"
  | "supplies"
  | "teams"
  | "volunteer_roles"
  | "requirements"
  | "event_categories"
  | "task_categories"
  | "playbooks"
  | "sidebar_links"
  | "closures"
  | "contact_categories"
  | "integrations"
  | "audit_log"
  | "deleted";

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<MemberLike | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("areas");
  const [authChecked, setAuthChecked] = useState(false);
  const [fullUi, setFullUi] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data: meRow } = await supabase
        .from("members")
        .select("role, status, can_edit_settings, can_delete_settings, can_undelete_settings")
        .eq("user_id", user.id)
        .maybeSingle();
      const memberLike = (meRow as MemberLike | null) ?? null;
      if (!isStaff(memberLike)) {
        router.replace("/portal");
        return;
      }
      setMe(memberLike);
      setUserId(user.id);
      setFullUi(seesFullUi(user.email));
      // All board staff land on Members — any of them can work the
      // approval queue (D1).
      setTab("members");
      setAuthChecked(true);
    })();
  }, [router]);

  if (!authChecked || !me || !userId) {
    return (
      <div
        style={{
          padding: "40px 0",
          textAlign: "center",
          color: "var(--gw-fg-muted)",
          fontSize: 13,
        }}
      >
        Loading…
      </div>
    );
  }

  // Any board member works the approval queue; role/edit/remove inside
  // the tab stay super-admin-only via canManage.
  const showMembers = isStaff(me);
  // Deleted tab stays super-admin-only until the RLS follow-up lets board
  // members with the undelete grant see + restore soft-deleted rows.
  const showDeleted = isSuperAdmin(me);

  const tabs: { key: Tab; label: string; visible: boolean }[] = [
    { key: "members", label: "Members", visible: showMembers },
    { key: "areas", label: "Areas", visible: true },
    { key: "priorities", label: "Priorities", visible: true },
    { key: "assets", label: "Assets", visible: true },
    { key: "types", label: "Types", visible: true },
    { key: "supplies", label: "Supplies", visible: true },
    { key: "teams", label: "Teams", visible: isSuperAdmin(me) },
    { key: "volunteer_roles", label: "Volunteer Roles", visible: isSuperAdmin(me) },
    { key: "requirements", label: "Requirements", visible: canEditSettings(me) },
    { key: "event_categories", label: "Event Categories", visible: true },
    { key: "task_categories", label: "Task Categories", visible: true },
    { key: "playbooks", label: "Playbooks", visible: true },
    { key: "sidebar_links", label: "Sidebar Links", visible: isSuperAdmin(me) },
    { key: "closures", label: "Closures", visible: true },
    { key: "contact_categories", label: "Contact Types", visible: true },
    { key: "integrations", label: "Integrations", visible: true },
    { key: "audit_log", label: "Audit Log", visible: true },
    { key: "deleted", label: "Deleted", visible: showDeleted },
  ];
  const shownTabs = tabs.filter(
    (t) =>
      t.visible &&
      (fullUi ||
        RELEASED_TABS.has(t.key) ||
        (isSuperAdmin(me) && SUPER_ADMIN_RELEASED_TABS.has(t.key)))
  );

  return (
    <>
      {/* Outer tabs. Staged rollout: everyone else only gets the released
          tabs, and no bar at all when that leaves just one. */}
      {shownTabs.length > 1 && (
        <div data-tour="settings-tabs" style={{ display: "flex", gap: 2, marginBottom: 24, flexWrap: "wrap" }}>
          {shownTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                background: tab === t.key ? "var(--gw-bg-elev)" : "transparent",
                border: "1px solid",
                borderColor: tab === t.key ? "var(--gw-border)" : "transparent",
                fontSize: 13,
                fontWeight: 700,
                color: tab === t.key ? "var(--gw-fg)" : "var(--gw-fg-muted)",
                cursor: "pointer",
                transition: "all 120ms",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === "members" && showMembers && (
        <MembersTab currentUserId={userId} canManage={isSuperAdmin(me)} />
      )}
      {tab === "areas" && <AreasTab me={me} />}
      {tab === "priorities" && <PrioritiesTab me={me} />}
      {tab === "assets" && <AssetsTab me={me} />}
      {tab === "types" && <TypesTab me={me} />}
      {tab === "supplies" && <SuppliesTab me={me} />}
      {tab === "teams" && isSuperAdmin(me) && <TeamsSettingsTab />}
      {tab === "volunteer_roles" && isSuperAdmin(me) && <VolunteerRolesTab />}
      {tab === "requirements" && canEditSettings(me) && <RequirementsTab me={me} />}
      {tab === "event_categories" && <EventCategoriesTab me={me} />}
      {tab === "task_categories" && <TaskCategoriesTab me={me} />}
      {tab === "playbooks" && <PlaybooksTab me={me} />}
      {tab === "sidebar_links" && isSuperAdmin(me) && <SidebarLinksTab />}
      {tab === "closures" && <ClosuresTab me={me} />}
      {tab === "contact_categories" && <ContactCategoriesTab me={me} />}
      {tab === "integrations" && <IntegrationsTab />}
      {tab === "audit_log" && <AuditLogTab />}
      {tab === "deleted" && showDeleted && <DeletedTab />}
    </>
  );
}
