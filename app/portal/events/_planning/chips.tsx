import Link from "next/link";
import { Icons } from "../../../components/icons";
import type { PlaybookLink, RoleChip as Role } from "../../../../lib/planning/types";

// The role a task belongs to, in the color Settings → Planning Roles gives it.
export function RoleChip({ role }: { role: Role | null }) {
  if (!role) return null;
  return <span className={`rsd-chip ${role.chip_class}`}>{role.name}</span>;
}

// The playbook that explains how to do a task: opens it.
export function PlaybookChip({ playbook }: { playbook: PlaybookLink | null }) {
  if (!playbook) return null;
  return (
    <Link
      href={`/portal/docs/${playbook.id}`}
      className="rsd-chip rsd-chip-mute gw-press"
      title="Open the playbook"
      style={{ display: "inline-flex", alignItems: "center", gap: 5, textDecoration: "none" }}
    >
      <Icons.BookOpen width={12} height={12} />
      {playbook.title}
    </Link>
  );
}
