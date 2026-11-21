"use client";

// The team name at the top of a team film page, as a menu of the other
// teams whose page is on. Each opens that team's own link.

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { watchPagePath } from "../../../lib/film/watch";
import styles from "./watch.module.css";

export function TeamSwitcher({
  pageKey,
  teamLabel,
  teams,
}: {
  pageKey: string;
  teamLabel: string;
  teams: { pageKey: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    // Start on the current team so arrow keys and Tab go from there.
    wrap.current?.querySelector<HTMLAnchorElement>('[aria-current="page"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (teams.length < 2) return <h1 className={styles.teamName}>{teamLabel}</h1>;

  function move(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const links = [...(wrap.current?.querySelectorAll<HTMLAnchorElement>(`.${styles.switchItem}`) ?? [])];
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next = e.key === "ArrowDown" ? Math.min(links.length - 1, at + 1) : Math.max(0, at - 1);
    links[next]?.focus();
  }

  return (
    <div ref={wrap} className={styles.switch} data-open={open || undefined}>
      <h1 className={styles.teamName}>
        <button
          ref={button}
          type="button"
          className={styles.switchButton}
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={styles.switchLabel}>{teamLabel}</span>
          <svg className={styles.switchChevron} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
          <span className={styles.srOnly}>, switch team</span>
        </button>
      </h1>
      {open && (
        <div id={listId} className={styles.switchMenu} onKeyDown={move}>
          <div className={styles.switchHead}>Team film</div>
          <nav aria-label="Teams">
            {teams.map((t) => {
              const current = t.pageKey === pageKey;
              return (
                <Link
                  key={t.pageKey}
                  href={watchPagePath(t.pageKey)}
                  className={styles.switchItem}
                  aria-current={current ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <span>{t.label}</span>
                  {current && (
                    <svg className={styles.switchCheck} viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
