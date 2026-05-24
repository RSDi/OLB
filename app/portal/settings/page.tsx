"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../components/icons";
import { createClient } from "../../../lib/supabase/client";

type MemberStatus = "pending" | "approved" | "denied";

interface Member {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  status: MemberStatus;
  requested_at: string;
  reviewed_at: string | null;
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function SettingsPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<MemberStatus>("pending");
  const [acting, setActing] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("members")
      .select("id, email, full_name, avatar_url, status, requested_at, reviewed_at")
      .order("requested_at", { ascending: false });
    setMembers((data as Member[]) ?? []);
    setLoading(false);
  }, []);

  // Gate the page client-side. RLS already prevents non-admins from doing any
  // mutations, but this avoids them seeing the empty UI in the first place.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const { data: me } = await supabase
        .from("members")
        .select("is_admin")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!me?.is_admin) { router.replace("/portal"); return; }
      setAuthChecked(true);
      load();
    })();
  }, [router, load]);

  if (!authChecked) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  async function setStatus(id: string, status: MemberStatus) {
    setActing(id);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from("members")
      .update({ status, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    await load();
    setActing(null);
  }

  async function removeMember(id: string) {
    setActing(id);
    const supabase = createClient();
    await supabase.from("members").delete().eq("id", id);
    await load();
    setActing(null);
  }

  const byStatus = (s: MemberStatus) => members.filter(m => m.status === s);
  const counts = { pending: byStatus("pending").length, approved: byStatus("approved").length, denied: byStatus("denied").length };

  const tabs: { key: MemberStatus; label: string }[] = [
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "denied", label: "Denied" },
  ];

  return (
    <>
      <div>
        <div className="rsd-eyebrow" style={{ marginBottom: 6 }}>Admin</div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>Members</h2>
      </div>

      <div style={{ maxWidth: 680 }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, marginBottom: 20 }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "8px 16px", borderRadius: 8,
                background: tab === t.key ? "var(--gw-bg-elev)" : "transparent",
                border: "1px solid",
                borderColor: tab === t.key ? "var(--gw-border)" : "transparent",
                fontSize: 13, fontWeight: 700,
                color: tab === t.key ? "var(--gw-fg)" : "var(--gw-fg-muted)",
                cursor: "pointer", transition: "all 120ms",
              }}
            >
              {t.label}
              {counts[t.key] > 0 && (
                <span style={{
                  background: t.key === "pending" ? "var(--gw-error)" : "var(--gw-bg)",
                  color: t.key === "pending" ? "#fff" : "var(--gw-fg-muted)",
                  border: t.key !== "pending" ? "1px solid var(--gw-border)" : "none",
                  fontSize: 10, fontWeight: 800, borderRadius: 100,
                  padding: "1px 6px", lineHeight: 1.6,
                }}>
                  {counts[t.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>
            Loading…
          </div>
        ) : byStatus(tab).length === 0 ? (
          <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
              {tab === "pending" ? "No pending requests" : tab === "approved" ? "No approved members yet" : "No denied requests"}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {byStatus(tab).map(member => (
              <MemberRow
                key={member.id}
                member={member}
                tab={tab}
                acting={acting === member.id}
                onApprove={() => setStatus(member.id, "approved")}
                onDeny={() => setStatus(member.id, "denied")}
                onRestore={() => setStatus(member.id, "pending")}
                onRemove={() => removeMember(member.id)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function MemberRow({ member, tab, acting, onApprove, onDeny, onRestore, onRemove }: {
  member: Member;
  tab: MemberStatus;
  acting: boolean;
  onApprove: () => void;
  onDeny: () => void;
  onRestore: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rsd-card" style={{
      flexDirection: "row", alignItems: "center", gap: 14,
      padding: "14px 18px", opacity: acting ? 0.5 : 1,
      transition: "opacity 150ms",
    }}>
      {/* Avatar */}
      <div style={{
        width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
        background: "var(--gw-bg-elev)", border: "1px solid var(--gw-border)",
        overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {member.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={member.avatar_url} alt="" width={40} height={40} style={{ objectFit: "cover" }}/>
        ) : (
          <Icons.Users width={18} height={18} style={{ color: "var(--gw-fg-muted)" }}/>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)", lineHeight: 1.2 }}>
          {member.full_name ?? "Unknown"}
        </div>
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 2, display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.email}</span>
          <span style={{ flexShrink: 0 }}>·</span>
          <span style={{ flexShrink: 0 }}>
            {tab === "pending" ? `Requested ${timeAgo(member.requested_at)}` : `Reviewed ${timeAgo(member.reviewed_at ?? member.requested_at)}`}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {tab === "pending" && (
          <>
            <ActionBtn onClick={onApprove} disabled={acting} color="var(--rsd-accent)" bgColor="var(--rsd-accent-bg)">
              Approve
            </ActionBtn>
            <ActionBtn onClick={onDeny} disabled={acting} color="var(--gw-error)" bgColor="var(--gw-error-bg)">
              Deny
            </ActionBtn>
          </>
        )}
        {tab === "approved" && (
          <ActionBtn onClick={onRemove} disabled={acting} color="var(--gw-error)" bgColor="var(--gw-error-bg)">
            Revoke
          </ActionBtn>
        )}
        {tab === "denied" && (
          <>
            <ActionBtn onClick={onApprove} disabled={acting} color="var(--rsd-accent)" bgColor="var(--rsd-accent-bg)">
              Approve
            </ActionBtn>
            <ActionBtn onClick={onRemove} disabled={acting} color="var(--gw-fg-muted)" bgColor="var(--gw-bg-elev)">
              Remove
            </ActionBtn>
          </>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ children, onClick, disabled, color, bgColor }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  color: string;
  bgColor: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "6px 14px", borderRadius: 8,
        background: bgColor, color,
        border: `1px solid ${color}33`,
        fontSize: 12, fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "opacity 120ms",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}
