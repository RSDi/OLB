import Link from "next/link";
import { Icons } from "../../../components/icons";
import { MarkdownView } from "../../../components/MarkdownView";
import type { TaskPlanning } from "../../../../lib/planning/data";
import { monthLabel, seasonLabel } from "../../../../lib/planning/season";
import { RoleChip } from "./chips";
import { formatStamp } from "./format";

// On a task that came from the Planning template: where it sits in the
// season, the playbook that explains how, and what the board meetings said.
export function TaskPlanningCard({ planning }: { planning: TaskPlanning }) {
  return (
    <div className="rsd-card" style={{ gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Planning</h3>
        <Link
          href={`/portal/events?view=year&season=${planning.season}`}
          style={{ fontSize: 12, fontWeight: 700, color: "var(--rsd-accent)", textDecoration: "none" }}
        >
          {monthLabel(planning.month)} · {seasonLabel(planning.season)} season
        </Link>
        <RoleChip role={planning.role} />
      </div>

      {planning.playbook && (
        <Link
          href={`/portal/docs/${planning.playbook.id}`}
          className="gw-press"
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid var(--rsd-accent-line)",
            background: "var(--rsd-accent-bg)",
            textDecoration: "none",
            color: "var(--gw-fg)",
          }}
        >
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--rsd-accent-fill)",
              color: "var(--rsd-accent-fill-on)",
            }}
          >
            <Icons.BookOpen width={16} height={16} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--gw-fg-muted)" }}>
              Playbook
            </span>
            <span style={{ display: "block", fontSize: 14, fontWeight: 700 }}>{planning.playbook.title}</span>
            {planning.playbook.excerpt && (
              <span style={{ display: "block", fontSize: 12, color: "var(--gw-fg-muted)", marginTop: 2, lineHeight: 1.5 }}>
                {planning.playbook.excerpt}
              </span>
            )}
          </span>
          <Icons.ChevronRight width={14} height={14} />
        </Link>
      )}

      {planning.notes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--gw-fg-muted)" }}>
            From board meetings
          </div>
          {planning.notes.map((n) => (
            <div key={n.month} style={{ borderLeft: "3px solid var(--rsd-accent-line)", paddingLeft: 12 }}>
              <Link
                href={`/portal/events/meetings/${n.month}`}
                style={{ fontSize: 12, fontWeight: 700, color: "var(--rsd-accent)", textDecoration: "none" }}
              >
                {monthLabel(n.month)} meeting
              </Link>
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                <MarkdownView>{n.note_md}</MarkdownView>
              </div>
              <div style={{ fontSize: 11, color: "var(--gw-fg-muted)" }}>
                {n.by ?? "A board member"} · {formatStamp(n.at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
