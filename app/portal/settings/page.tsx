"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import { isStaff, isSuperAdmin, type MemberLike } from "../../../lib/auth/permissions";
import { MembersTab } from "./MembersTab";
import { AreasTab } from "./AreasTab";
import { PrioritiesTab } from "./PrioritiesTab";
import { AssetsTab } from "./AssetsTab";
import { TypesTab } from "./TypesTab";
import { SuppliesTab } from "./SuppliesTab";
import { AssignmentsTab } from "./AssignmentsTab";
import { EventCategoriesTab } from "./EventCategoriesTab";
import { PlaybooksTab } from "./PlaybooksTab";
import { DeletedTab } from "./DeletedTab";

type Tab =
  | "members"
  | "areas"
  | "priorities"
  | "assets"
  | "types"
  | "supplies"
  | "assignments"
  | "event_categories"
  | "playbooks"
  | "deleted";

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<MemberLike | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("areas");
  const [authChecked, setAuthChecked] = useState(false);

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
        .select("role, status")
        .eq("user_id", user.id)
        .maybeSingle();
      const memberLike = (meRow as MemberLike | null) ?? null;
      if (!isStaff(memberLike)) {
        router.replace("/portal");
        return;
      }
      setMe(memberLike);
      setUserId(user.id);
      // Super-admins land on Members (they have an approval queue to clear);
      // admins land on Areas (their main job here).
      setTab(isSuperAdmin(memberLike) ? "members" : "areas");
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

  const showMembers = isSuperAdmin(me);
  const showDeleted = isSuperAdmin(me);

  const tabs: { key: Tab; label: string; visible: boolean }[] = [
    { key: "members", label: "Members", visible: showMembers },
    { key: "areas", label: "Areas", visible: true },
    { key: "priorities", label: "Priorities", visible: true },
    { key: "assets", label: "Assets", visible: true },
    { key: "types", label: "Types", visible: true },
    { key: "supplies", label: "Supplies", visible: true },
    { key: "assignments", label: "Assignments", visible: true },
    { key: "event_categories", label: "Event Categories", visible: true },
    { key: "playbooks", label: "Playbooks", visible: true },
    { key: "deleted", label: "Deleted", visible: showDeleted },
  ];

  return (
    <>
      <div>
        <div className="rsd-eyebrow" style={{ marginBottom: 6 }}>
          Admin
        </div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>
          Settings
        </h2>
      </div>

      {/* Outer tabs */}
      <div style={{ display: "flex", gap: 2, marginTop: 20, marginBottom: 24, flexWrap: "wrap" }}>
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

      {tab === "members" && showMembers && <MembersTab currentUserId={userId} />}
      {tab === "areas" && <AreasTab me={me} />}
      {tab === "priorities" && <PrioritiesTab me={me} />}
      {tab === "assets" && <AssetsTab me={me} />}
      {tab === "types" && <TypesTab />}
      {tab === "supplies" && <SuppliesTab me={me} />}
      {tab === "assignments" && <AssignmentsTab />}
      {tab === "event_categories" && <EventCategoriesTab me={me} />}
      {tab === "playbooks" && <PlaybooksTab me={me} />}
      {tab === "deleted" && showDeleted && <DeletedTab />}
    </>
  );
}
