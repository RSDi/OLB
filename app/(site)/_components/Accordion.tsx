"use client";
import { useId, useState } from "react";
import styles from "./site.module.css";
import { cx } from "./util";

export type AccordionItem = { title: string; content: React.ReactNode };

// Squarespace's accordion block: one item open at a time, a plus that turns
// into a minus, hairline dividers.
export function Accordion({ items }: { items: AccordionItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const id = useId();

  return (
    <ul className={styles.accordion}>
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <li key={i} className={styles.accordionItem} data-open={isOpen}>
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
                <span className={styles.accordionTitle}>{item.title}</span>
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
