"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/portal/teams", label: "Board", exact: true },
  { href: "/portal/teams/registrations", label: "Registrations", exact: false },
  { href: "/portal/teams/import", label: "Import", exact: false },
];

export default function TeamsNav() {
  const path = usePathname() ?? "";
  return (
    <nav className="olb-nav">
      {LINKS.map((l) => {
        const active = l.exact ? path === l.href : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} data-active={active}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
