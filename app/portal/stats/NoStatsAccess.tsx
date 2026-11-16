export function NoStatsAccess() {
  return (
    <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)", marginBottom: 6 }}>Stats are for coaches and the board</div>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5 }}>
        Coaches, the board and anyone with the <strong>Teams &amp; volunteers</strong> permission can open this.
      </div>
    </div>
  );
}
