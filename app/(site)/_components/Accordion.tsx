"use client";
import { useEffect, useId, useState } from "react";
import styles from "./site.module.css";
import { cx } from "./util";

export type AccordionItem = {
  title: string;
  content: React.ReactNode;
  pill?: { label: string; tone: "open" | "closed" };
  muted?: boolean;
  // When set, /programs#id scrolls here and opens this row.
  id?: string;
};

// Squarespace's accordion block: one item open at a time, a plus that turns
// into a minus, hairline dividers. A pill under the title is the program's
// status (closed, assessments open). A hash matching an item's id opens
// that row (the Messages box uses #14u for 14U Competitive).
export function Accordion({ items }: { items: AccordionItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const id = useId();
  const anchors = items.map((item) => item.id ?? "").join("\0");

  useEffect(() => {
    const syncFromHash = () => {
      const hash = decodeURIComponent(location.hash.replace(/^#/, "")).toLowerCase();
      if (!hash) return;
      const ids = anchors.split("\0");
      const i = ids.findIndex((anchor) => anchor && anchor.toLowerCase() === hash);
      if (i < 0) return;
      setOpen(i);
      const elId = ids[i];
      requestAnimationFrame(() => {
        document.getElementById(elId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [anchors]);

  return (
    <ul className={styles.accordion}>
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <li id={item.id} key={item.id ?? i} className={styles.accordionItem} data-open={isOpen} data-muted={item.muted || undefined}>
            {i === 0 && <div className={styles.accordionDivider} aria-hidden="true" />}
            <h4 className={styles.accordionHeading}>
              <button
                type="button"
                id={`${id}-button-${i}`}
                className={styles.accordionButton}
                aria-expanded={isOpen}
                aria-controls={`${id}-panel-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                <span className={styles.accordionLead}>
                  <span className={styles.accordionTitle}>{item.title}</span>
                  {item.pill && (
                    <span className={cx(styles.pill, item.pill.tone === "open" ? styles.pillOpen : styles.pillClosed)}>
                      {item.pill.label}
                    </span>
                  )}
                </span>
                <span className={styles.plus} aria-hidden="true" />
              </button>
            </h4>
            <div
              id={`${id}-panel-${i}`}
              role="region"
              aria-labelledby={`${id}-button-${i}`}
              hidden={!isOpen}
              className={cx(styles.text, styles.accordionDescription)}
            >
              {item.content}
            </div>
            <div className={styles.accordionDivider} aria-hidden="true" />
          </li>
        );
      })}
    </ul>
  );
}
