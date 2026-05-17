import { Icons } from "../../components/icons";

export default function PortalSettingsPage() {
  return (
    <>
      <div>
        <div className="rsd-eyebrow" style={{ marginBottom: 6 }}>Admin</div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>Settings</h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 680 }}>
        {[
          { section: "Church Info", items: ["Church Name", "Address", "Phone", "Email", "Website"] },
          { section: "Staff & Access", items: ["Manage Staff Accounts", "Roles & Permissions", "Invite Staff Member"] },
          { section: "Notifications", items: ["Email Notifications", "Maintenance Alert Recipients"] },
        ].map(s => (
          <div key={s.section} className="rsd-card" style={{ gap: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: "var(--gw-fg-muted)", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 12 }}>
              {s.section}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {s.items.map((item, i) => (
                <button key={item} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "13px 0",
                  borderBottom: i < s.items.length - 1 ? "1px solid var(--gw-border)" : "none",
                  background: "none", border: "none", textAlign: "left",
                  fontSize: 14, fontWeight: 600, color: "var(--gw-fg)",
                  cursor: "pointer",
                }}>
                  {item}
                  <Icons.ChevronRight width={14} height={14} style={{ color: "var(--gw-fg-muted)" }}/>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
