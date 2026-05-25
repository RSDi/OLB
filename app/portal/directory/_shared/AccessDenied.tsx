// Inline notice rendered when an unapproved member hits a directory view.
export function AccessDenied() {
  return (
    <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)", marginBottom: 6 }}>
        Directory unavailable
      </div>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
        The member directory is open to approved members. A super-admin needs to approve your
        account first.
      </div>
    </div>
  );
}
