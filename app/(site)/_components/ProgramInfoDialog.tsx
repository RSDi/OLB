"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ProgramDetails } from "./ProgramDetails";
import site from "./site.module.css";
import styles from "./ProgramInfoDialog.module.css";

// 14U practice times and fees from programs.list. Modal on desktop, bottom
// sheet on a phone. Native <dialog> traps focus and handles Esc.
export function ProgramInfoDialog({
  open,
  onClose,
  title,
  body,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open, mounted]);

  if (!mounted) return null;

  return createPortal(
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.panel}>
        <div className={styles.bar}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className={`${styles.body} ${site.text}`}>
          <ProgramDetails body={body} />
        </div>
      </div>
    </dialog>,
    document.body,
  );
}

export function ProgramInfoLink({
  title,
  body,
  className,
}: {
  title: string;
  body: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        Practice times and payment info
      </button>
      <ProgramInfoDialog open={open} onClose={() => setOpen(false)} title={title} body={body} />
    </>
  );
}
