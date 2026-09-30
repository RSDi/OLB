import Link from "next/link";
import { Icons } from "../../../components/icons";
import { MEETING_STATUS_LABELS } from "../../../../lib/planning/logic";
import type { MonthKey } from "../../../../lib/planning/season";
import type { PlanningMeeting } from "../../../../lib/planning/types";
import { formatPlainDate } from "./format";

// Agenda topics in a saved agenda: its list items.
export function agendaTopicCount(md: string): number {
  return md.split("\n").filter((l) => /^\s*([-*+]|\d+[.)])\s+\S/.test(l)).length;
}

export function meetingHref(month: MonthKey): string {
  return `/portal/events/meetings/${month}`;
}

// A month's board meeting: when, whether it happened, and whether minutes are
// in. Every month has one; it's saved the first time someone opens and saves it.
export function MeetingRow({
  month,
  meeting,
  draftTopics,
  compact = false,
}: {
  month: MonthKey;
  meeting: PlanningMeeting | null;
  // Topics the template suggests, for a meeting nobody has opened yet.
  draftTopics: number;
  compact?: boolean;
}) {
  const status = meeting?.status ?? "planned";
  const topics = meeting ? agendaTopicCount(meeting.agenda_md) : draftTopics;
  const hasMinutes = !!meeting?.minutes_md.trim();
  const when = meeting?.meets_on ? formatPlainDate(meeting.meets_on) : null;
  const statusChip =
    status === "held" ? "rsd-chip-success" : status === "skipped" ? "rsd-chip-mute" : "rsd-chip-accent";

  return (
    <Link
      href={meetingHref(month)}
      data-tour="planning-meeting"
      className="gw-press"
      style={{
        display: "flex",
        gap: compact ? 8 : 14,
        alignItems: "center",
        padding: compact ? "8px 10px" : "12px 18px",
        textDecoration: "none",
        color: "var(--gw-fg)",
        background: "var(--rsd-accent-bg)",
        borderRadius: compact ? 10 : 0,
        borderBottom: compact ? "none" : "1px solid var(--gw-border)",
      }}
    >
      <span
        style={{
          width: compact ? 26 : 34,
          height: compact ? 26 : 34,
          borderRadius: 10,
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--rsd-accent-fill)",
          color: "var(--rsd-accent-fill-on)",
        }}
      >
        <Icons.Users width={compact ? 14 : 16} height={compact ? 14 : 16} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: compact ? 13 : 14, fontWeight: 700 }}>
          Board meeting
          <span style={{ fontWeight: 500, color: "var(--gw-fg-muted)" }}>
            {" · "}
            {status === "skipped" ? "None this month" : when ?? "Date not set"}
          </span>
        </span>
        {!compact && (
          <span style={{ display: "block", fontSize: 12, color: "var(--gw-fg-muted)", marginTop: 2 }}>
            {topics > 0 ? `${topics} agenda ${topics === 1 ? "topic" : "topics"}` : "No agenda yet"}
            {hasMinutes ? " · Minutes logged" : ""}
          </span>
        )}
      </span>
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
        {status !== "planned" && <span className={`rsd-chip ${statusChip}`}>{MEETING_STATUS_LABELS[status]}</span>}
        {compact && hasMinutes && <span className="rsd-chip rsd-chip-success">Minutes</span>}
        <Icons.ChevronRight width={14} height={14} />
      </span>
    </Link>
  );
}
