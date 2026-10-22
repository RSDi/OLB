import type { ReactNode } from "react";
import s from "./wizard.module.css";

// Shared chrome for the registration wizard and the 14U assessment wizard.

export function ContinueButton({ label = "Continue" }: { label?: string }) {
  return (
    <button type="submit" className={s.primary}>
      {label}
    </button>
  );
}

export function Question({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <>
      <h2 className={s.question} tabIndex={-1}>
        {title}
      </h2>
      {children && <p className={s.lead}>{children}</p>}
    </>
  );
}

export function Choice({ on, onClick, label, sub }: { on: boolean; onClick: () => void; label: string; sub?: string }) {
  return (
    <button type="button" className={s.choice} aria-pressed={on} onClick={onClick}>
      <span>
        {label}
        {sub && <span className={s.choiceSub}>{sub}</span>}
      </span>
      <Tick />
    </button>
  );
}

export function Tick() {
  return (
    <span className={s.tick} aria-hidden="true">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}

export function Summary({ title, onChange, children }: { title: string; onChange: () => void; children: ReactNode }) {
  return (
    <div className={s.summary}>
      <div className={s.summaryHead}>
        <span className={s.summaryTitle}>{title}</span>
        <button type="button" className={s.linkBtn} onClick={onChange}>
          Change
        </button>
      </div>
      {children}
    </div>
  );
}

export function Line({ children }: { children: ReactNode }) {
  return <span className={s.summaryLine}>{children}</span>;
}

export function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className={`olb-alert olb-alert--error ${s.error}`} role="alert">
      {text}
    </div>
  );
}
