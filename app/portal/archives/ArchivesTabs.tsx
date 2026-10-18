"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ARCHIVES_ALBUM, ARCHIVES_EMAIL, ARCHIVES_SLACK } from "../../../lib/slack-archive/paths";

type Tab = "slack" | "email" | "album";

function currentTab(pathname: string): Tab {
  if (pathname.startsWith(ARCHIVES_EMAIL)) return "email";
  if (pathname.startsWith(ARCHIVES_ALBUM)) return "album";
  return "slack";
}

export function ArchivesTabs({
  staff,
  emailCount,
}: {
  staff: boolean;
  emailCount: number;
}) {
  const pathname = usePathname() ?? "";
  const on = currentTab(pathname);
  const tabs: { key: Tab; href: string; label: string; tour: string; show: boolean; count?: number }[] = [
    { key: "slack", href: ARCHIVES_SLACK, label: "Slack", tour: "archives-tab-slack", show: true },
    { key: "email", href: ARCHIVES_EMAIL, label: "Email", tour: "archives-tab-email", show: staff, count: emailCount },
    { key: "album", href: ARCHIVES_ALBUM, label: "Album", tour: "archives-tab-album", show: true },
  ];
  return (
    <nav
      data-tour="archives-tabs"
      aria-label="Archives"
      style={{
        display: "flex",
        gap: 4,
        borderBottom: "1px solid var(--gw-border)",
        margin: "0 0 18px",
      }}
    >
      {tabs.filter((t) => t.show).map((t) => {
        const active = on === t.key;
        return (
          <Link
            key={t.key}
            href={t.href}
            data-tour={t.tour}
            aria-current={active ? "page" : undefined}
            className={active ? "rsd-archives-tab on" : "rsd-archives-tab"}
            style={{
              padding: "9px 16px",
              fontWeight: 700,
              fontSize: 13,
              color: active ? "var(--gw-fg)" : "var(--gw-fg-muted)",
              textDecoration: "none",
              borderBottom: "2px solid",
              borderColor: active ? "var(--rsd-accent-fill)" : "transparent",
              marginBottom: -1,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {t.label}
            {t.key === "email" && (t.count ?? 0) > 0 && (
              <span className="rsd-chip rsd-chip-mute" style={{ fontSize: 11 }}>
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
