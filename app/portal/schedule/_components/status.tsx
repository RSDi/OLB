// How each weekend status looks: the spreadsheet's colors (red, yellow, pale
// yellow, green), softened for the page. The words always say it too.

import type { HsWeekendStatus } from "../../../../lib/hs-schedule/types";
import { weekendStatusLabel } from "../../../../lib/hs-schedule/logic";

export const STATUS_STYLE: Record<HsWeekendStatus, { bar: string; tint: string; ink: string }> = {
  planned: { bar: "transparent", tint: "transparent", ink: "var(--gw-fg-muted)" },
  tentative: { bar: "#E5484D", tint: "rgba(229, 72, 77, 0.09)", ink: "#B42318" },
  need_facility: { bar: "#F2C200", tint: "rgba(255, 214, 0, 0.16)", ink: "#8A6100" },
  in_process: { bar: "#E3C67A", tint: "rgba(255, 242, 204, 0.75)", ink: "#7A5C12" },
  secured: { bar: "#2E9E4F", tint: "rgba(46, 158, 79, 0.10)", ink: "#1E6B35" },
  canceled: { bar: "#A1A1AA", tint: "rgba(161, 161, 170, 0.12)", ink: "var(--gw-fg-muted)" },
  off: { bar: "#D4D4D8", tint: "rgba(212, 212, 216, 0.22)", ink: "var(--gw-fg-muted)" },
};

export function StatusChip({ status, small }: { status: HsWeekendStatus; small?: boolean }) {
  const st = STATUS_STYLE[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: small ? "1px 7px" : "2px 9px",
        borderRadius: 100,
        fontSize: small ? 10 : 11,
        fontWeight: 700,
        whiteSpace: "nowrap",
        color: st.ink,
        background: status === "planned" ? "var(--gw-bg)" : st.tint,
        border: `1px solid ${status === "planned" ? "var(--gw-border)" : st.bar}`,
      }}
    >
      {status !== "planned" && (
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, background: st.bar, flexShrink: 0 }} />
      )}
      {weekendStatusLabel(status)}
    </span>
  );
}
