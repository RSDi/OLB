"use client";
// A link to one Settings tab that remembers where you were, so Settings can
// show "← Back". SettingsText turns every "Settings → <Tab>" in a message
// (including errors from the server) into one of these.

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { settingsHref, splitSettingsRefs } from "../../lib/settings-links";

export function SettingsLink({ tab, children }: { tab: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <Link
      href={settingsHref(tab)}
      style={{ fontWeight: 700, color: "inherit", textDecoration: "underline" }}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        // Settings picks its tab on load, so a link from one Settings tab to
        // another loads the page fresh; everywhere else keeps a "← Back".
        if (window.location.pathname.startsWith("/portal/settings")) {
          window.location.assign(settingsHref(tab));
          return;
        }
        router.push(settingsHref(tab, window.location.pathname + window.location.search));
      }}
    >
      {children}
    </Link>
  );
}

export function SettingsText({ text }: { text: string }) {
  return (
    <>
      {splitSettingsRefs(text).map((part, i) =>
        part.tab ? (
          <SettingsLink key={i} tab={part.tab}>
            {part.text}
          </SettingsLink>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}
