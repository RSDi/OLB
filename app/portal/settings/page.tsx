"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import { isStaff, isSuperAdmin, type MemberLike } from "../../../lib/auth/permissions";
import { seesFullUi } from "../../../lib/auth/feature-preview";
import { MembersTab } from "./MembersTab";
import { AreasTab } from "./AreasTab";
import { PrioritiesTab } from "./PrioritiesTab";
import { AssetsTab } from "./AssetsTab";
import { TypesTab } from "./TypesTab";
import { SuppliesTab } from "./SuppliesTab";
import { VolunteerTeamsTab } from "./VolunteerTeamsTab";
import { EventCategoriesTab } from "./EventCategoriesTab";
import { TaskCategoriesTab } from "./TaskCategoriesTab";
import { PlaybooksTab } from "./PlaybooksTab";
import { ClosuresTab } from "./ClosuresTab";
import { ContactCategoriesTab } from "./ContactCategoriesTab";
import { AuditLogTab } from "./AuditLogTab";
import { DeletedTab } from "./DeletedTab";
import { IntegrationsTab } from "./IntegrationsTab";

type Tab =
  | "members"
  | "areas"
  | "priorities"
  | "assets"
  | "types"
  | "supplies"
  | "volunteer_teams"
  | "event_categories"
  | "task_categories"
  | "playbooks"
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
      // All committee staff land on Members — any of them can work the
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

  // Any committee member works the approval queue; role/edit/remove inside
  // the tab stay super-admin-only via canManage.
  const showMembers = isStaff(me);
  // Deleted tab stays super-admin-only until the RLS follow-up lets committee
  // members with the undelete grant see + restore soft-deleted rows.
  const showDeleted = isSuperAdmin(me);

  const tabs: { key: Tab; label: string; visible: boolean }[] = [
    { key: "members", label: "Members", visible: showMembers },
    { key: "areas", label: "Areas", visible: true },
    { key: "priorities", label: "Priorities", visible: true },
    { key: "assets", label: "Assets", visible: true },
    { key: "types", label: "Types", visible: true },
    { key: "supplies", label: "Supplies", visible: true },
    { key: "volunteer_teams", label: "Teams", visible: true },
    { key: "event_categories", label: "Event Categories", visible: true },
    { key: "task_categories", label: "Task Categories", visible: true },
    { key: "playbooks", label: "Playbooks", visible: true },
    { key: "closures", label: "Closures", visible: true },
    { key: "contact_categories", label: "Contact Types", visible: true },
    { key: "integrations", label: "Integrations", visible: true },
    { key: "audit_log", label: "Audit Log", visible: true },
    { key: "deleted", label: "Deleted", visible: showDeleted },
  ];

  return (
    <>
      {/* Outer tabs. Staged rollout: everyone else only gets Members, so
          the tab bar is hidden for them. */}
      {fullUi && (
        <div style={{ display: "flex", gap: 2, marginBottom: 24, flexWrap: "wrap" }}>
          {tabs
            .filter((t) => t.visible)
            .map((t) => (
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
      {tab === "volunteer_teams" && <VolunteerTeamsTab me={me} />}
      {tab === "event_categories" && <EventCategoriesTab me={me} />}
      {tab === "task_categories" && <TaskCategoriesTab me={me} />}
      {tab === "playbooks" && <PlaybooksTab me={me} />}
      {tab === "closures" && <ClosuresTab me={me} />}
      {tab === "contact_categories" && <ContactCategoriesTab me={me} />}
      {tab === "integrations" && <IntegrationsTab />}
      {tab === "audit_log" && <AuditLogTab />}
      {tab === "deleted" && showDeleted && <DeletedTab />}
    </>
  );
}
