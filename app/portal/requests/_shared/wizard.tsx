"use client";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Pill } from "../../../components/ui";
import { createRequest } from "../../../../lib/maintenance/actions";

// ─── Wizard engine ───────────────────────────────────────────────
// A config-driven multi-step form. Each track supplies a list of steps; the
// shell owns progress, back/next, validation, conditional steps, submit, and
// the success screen. Step `body` functions render the fields using the shared
// primitives below and the ctx helpers (set / toggle).

export type RequestForm = Record<string, unknown>;

export interface WizardCtx {
  form: RequestForm;
  set: (key: string, value: unknown) => void;
  toggle: (key: string, value: string) => void;
  // Single-select pickers: set value(s) AND advance to the next step in one tap.
  choose: (updates: Record<string, unknown>) => void;
}

export interface WizardStep {
  key: string;
  title: string;
  hint?: string;
  show?: (form: RequestForm) => boolean;
  valid?: (form: RequestForm) => boolean;
  // A pick-one step whose options self-advance (via ctx.choose). The footer
  // "Next" is hidden — selecting an option moves on; Back stays at the top.
  autoAdvance?: boolean;
  // A router/entry step where the choice determines the rest of the flow (and
  // its length) — e.g. picking "Sports" hands off to the 4-step gym track, or
  // repair-vs-purchase changes which steps follow. The total step count is
  // unknown here, so we show "Step 1" without an "of N" promise or a
  // proportional bar until the path is chosen.
  branches?: boolean;
  // The final "review & send" screen. Not given a step number — it's the
  // send-off, not a question — so the count reflects only the questions asked.
  terminal?: boolean;
  body: (ctx: WizardCtx) => ReactNode;
  // Template routing: if this returns a path, advancing from the step navigates
  // there instead of going to the next step. Lets a "what are you planning?"
  // choice hand off to a dedicated template flow (e.g. sports → the gym track).
  nextHref?: (form: RequestForm) => string | null;
}

export interface TrackConfig {
  key: string;
  title: string;
  initial: RequestForm;
  steps: WizardStep[];
  successBody?: string;
}

export function RequestWizard({
  trackKey,
  title,
  steps,
  initial,
  requesterName,
  successBody,
  // Steps already completed in a flow that handed off to this one (e.g. picking
  // "Sports" in building-use → the gym track). Keeps the count continuous
  // (gym opens at "Step 2 of 4", not a fresh "Step 1") instead of resetting.
  priorSteps = 0,
}: Omit<TrackConfig, "key"> & { trackKey: string; requesterName: string | null; priorSteps?: number }) {
  const router = useRouter();
  const [form, setForm] = useState<RequestForm>(initial);
  const [stepIndex, setStepIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (key: string, value: string) =>
    setForm((f) => {
      const arr = Array.isArray(f[key]) ? (f[key] as string[]) : [];
      return { ...f, [key]: arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value] };
    });

  const visible = useMemo(() => steps.filter((s) => !s.show || s.show(form)), [steps, form]);
  const idx = Math.min(stepIndex, visible.length - 1);
  const step = visible[idx];
  const isLast = idx === visible.length - 1;
  const canAdvance = !step.valid || step.valid(form);

  // Step numbering: count only the question steps (the terminal review/send
  // screen isn't numbered), and offset by any steps already done before a
  // hand-off so the count stays continuous across tracks.
  const numbered = visible.filter((s) => !s.terminal);
  const totalNumbered = priorSteps + numbered.length;
  const numberedIndex = numbered.indexOf(step); // -1 on the terminal step
  const stepNumber = priorSteps + numberedIndex + 1;

  // The progress label/bar:
  // - branching entry step: total unknown → "Step N" + a small starter sliver.
  // - terminal review step: "Review" + a full bar.
  // - otherwise: "Step N of T" + proportional fill.
  const progressLabel = step.branches
    ? `Step ${stepNumber}`
    : step.terminal
      ? "Review"
      : `Step ${stepNumber} of ${totalNumbered}`;
  const progressPct = step.branches
    ? 9
    : step.terminal
      ? 100
      : (stepNumber / totalNumbered) * 100;

  // Back shows once we're past the first step, OR when we arrived via a hand-off
  // (so the gym flow's first step can step back to "what are you planning?").
  // Next is hidden on auto-advance picker steps (tapping an option moves on).
  const showBack = idx > 0 || priorSteps > 0;
  const showNext = !step.autoAdvance;

  // Advance using an explicit form snapshot, so a just-made selection counts
  // even though setForm is async. Recomputes visibility from `f` so conditional
  // steps route correctly (e.g. repair vs purchase). Returns true if it moved
  // or handed off; false on the last step so the caller can submit.
  function goForward(f: RequestForm): boolean {
    setError(null);
    const vis = steps.filter((s) => !s.show || s.show(f));
    const i = Math.min(stepIndex, vis.length - 1);
    const s = vis[i];
    if (s.valid && !s.valid(f)) return false;
    // Template hand-off: a step can redirect to a dedicated flow instead of
    // advancing (e.g. picking "Sports or gym time" launches the gym template).
    const href = s.nextHref?.(f);
    if (href) {
      router.push(href);
      return true;
    }
    if (i < vis.length - 1) {
      setStepIndex(i + 1);
      return true;
    }
    return false;
  }

  // Pick-one steps: record the choice and move on in a single tap.
  const choose = (updates: Record<string, unknown>) => {
    const nextForm = { ...form, ...updates };
    setForm(nextForm);
    goForward(nextForm);
  };
  const ctx: WizardCtx = { form, set, toggle, choose };

  function back() {
    setError(null);
    if (idx === 0) {
      // Handed off here from another flow → step back into that flow's entry
      // (only the building-use "what are you planning?" picker hands off today).
      router.push(priorSteps > 0 ? "/portal/requests/building-use" : "/portal/requests");
      return;
    }
    setStepIndex(idx - 1);
  }
  async function next() {
    if (!canAdvance) return;
    if (goForward(form)) return;
    // Last step → submit.
    setPending(true);
    const result = await createRequest(trackKey, form);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div
        className="rsd-card"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "40px 24px", textAlign: "center" }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "var(--gw-success-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--gw-success)",
          }}
        >
          <Icons.CheckCircle width={26} height={26} />
        </div>
        <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>Sent</h3>
        <p style={{ margin: 0, fontSize: 14, color: "var(--gw-fg-muted)", maxWidth: 380, lineHeight: 1.6 }}>
          Thanks{requesterName ? `, ${requesterName.split(" ")[0]}` : ""}! {successBody ?? "We'll be in touch."}
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <Pill variant="ghost" size="sm" onClick={() => router.push("/portal/requests")}>
            Make another
          </Pill>
          <Pill variant="accent" size="sm" onClick={() => router.push("/portal/tasks")}>
            View my requests
          </Pill>
        </div>
      </div>
    );
  }

  return (
    <div className="rsd-card gw-wizard" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Sticky header — nav + progress stay pinned to the top of the scrolling
          <main> while a tall step scrolls, so Next/Back + the step indicator are
          always reachable. .gw-wizard keeps the card overflow:visible so sticky
          escapes it and sticks to <main> rather than being trapped in the card. */}
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--gw-bg-elev)", display: "flex", flexDirection: "column", gap: 14, paddingTop: 2, paddingBottom: 12, borderBottom: "1px solid var(--gw-border)" }}>
      {/* Back + the primary action both up top so neither needs a scroll. */}
      {(showBack || showNext) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          {showBack ? (
            <button
              type="button"
              onClick={back}
              disabled={pending}
              className="gw-press"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "none",
                border: "none",
                padding: 0,
                color: "var(--gw-fg-muted)",
                fontSize: 13,
                fontWeight: 700,
                cursor: pending ? "default" : "pointer",
              }}
            >
              <Icons.ChevronLeft width={16} height={16} /> Back
            </button>
          ) : (
            <span />
          )}
          {showNext && (
            <Pill variant="accent" size="sm" onClick={next} disabled={pending || !canAdvance}>
              {isLast ? (pending ? "Sending…" : "Send request") : "Next"}
            </Pill>
          )}
        </div>
      )}

      {/* Progress */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)" }}>
          <span>{title}</span>
          <span>{progressLabel}</span>
        </div>
        <div style={{ height: 6, borderRadius: 100, background: "var(--gw-border)", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${progressPct}%`,
              background: "var(--rsd-accent-fill)",
              borderRadius: 100,
              transition: "width 220ms var(--gw-ease, ease)",
            }}
          />
        </div>
      </div>
      </div>{/* end sticky header */}

      {/* Step */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--gw-fg)" }}>{step.title}</h3>
          {step.hint && <p style={{ margin: 0, fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.6 }}>{step.hint}</p>}
        </div>
        {step.body(ctx)}
      </div>

      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--gw-error-bg)",
            border: "1px solid rgba(229,62,62,.25)",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 13,
            color: "var(--gw-error)",
            fontWeight: 600,
          }}
        >
          <Icons.AlertCircle width={16} height={16} />
          {error}
        </div>
      )}

    </div>
  );
}

// ─── Shared primitives ───────────────────────────────────────────

export function Column({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>;
}

export function Wrap({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>;
}

export function OptionCard({
  selected,
  onClick,
  icon,
  label,
  blurb,
}: {
  selected: boolean;
  onClick: () => void;
  icon?: ReactNode;
  label: string;
  blurb?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="gw-press"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        textAlign: "left",
        padding: "11px 13px",
        borderRadius: 12,
        cursor: "pointer",
        width: "100%",
        background: selected ? "var(--rsd-accent-bg)" : "var(--gw-bg)",
        border: `1.5px solid ${selected ? "var(--rsd-accent)" : "var(--gw-border)"}`,
        color: "var(--gw-fg)",
      }}
    >
      {icon && (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: selected ? "var(--rsd-accent-fill)" : "var(--gw-bg-elev)",
            color: selected ? "var(--rsd-accent-fill-on)" : "var(--gw-fg-muted)",
          }}
        >
          {icon}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
        {blurb && <div style={{ fontSize: 12.5, color: "var(--gw-fg-muted)", marginTop: 2, lineHeight: 1.5 }}>{blurb}</div>}
      </div>
      {selected && (
        <span style={{ color: "var(--rsd-accent)", flexShrink: 0 }}>
          <Icons.CheckCircle width={18} height={18} />
        </span>
      )}
    </button>
  );
}

export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="gw-press"
      style={{
        padding: "9px 14px",
        borderRadius: 100,
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        background: selected ? "var(--rsd-accent-fill)" : "var(--gw-bg)",
        color: selected ? "var(--rsd-accent-fill-on)" : "var(--gw-fg)",
        border: `1px solid ${selected ? "var(--rsd-accent-fill)" : "var(--gw-border)"}`,
      }}
    >
      {children}
    </button>
  );
}

export function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="gw-press"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "11px 12px",
        borderRadius: 10,
        background: "var(--gw-bg)",
        border: `1px solid ${checked ? "var(--rsd-accent)" : "var(--gw-border)"}`,
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: 6,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: checked ? "var(--rsd-accent-fill)" : "transparent",
          border: `1.5px solid ${checked ? "var(--rsd-accent)" : "var(--gw-border)"}`,
          color: "var(--rsd-accent-fill-on)",
        }}
      >
        {checked && <Icons.CheckCircle width={14} height={14} />}
      </span>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--gw-fg)" }}>{label}</span>
    </button>
  );
}

export function SummaryRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--gw-border)" }}>
      <span style={{ flex: "0 0 110px", fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".03em" }}>
        {label}
      </span>
      <span style={{ flex: 1, fontSize: 14, color: "var(--gw-fg)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}
