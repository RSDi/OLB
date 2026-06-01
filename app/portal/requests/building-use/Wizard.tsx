"use client";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Input, Textarea, Pill } from "../../../components/ui";
import {
  createBuildingUseRequest,
  type BuildingUseRequestInput,
} from "../../../../lib/maintenance/actions";

type StepKey = "type" | "who" | "spaces" | "when" | "people" | "needs" | "access" | "extras" | "review";

const SUBTYPES: { key: string; label: string; blurb: string; icon: ReactNode }[] = [
  { key: "gathering", label: "Gathering or meeting", blurb: "Fellowship, a group meeting, a get-together", icon: <Icons.Users width={20} height={20} /> },
  { key: "party", label: "Party or celebration", blurb: "Birthday, shower, anniversary, reception", icon: <Icons.Sparkles width={20} height={20} /> },
  { key: "wedding", label: "Wedding", blurb: "A ceremony and/or reception", icon: <Icons.Heart width={20} height={20} /> },
  { key: "class", label: "Class or program", blurb: "A class, group, or recurring activity", icon: <Icons.BookOpen width={20} height={20} /> },
  { key: "sports", label: "Sports or gym time", blurb: "Volleyball, basketball, open gym, play dates", icon: <Icons.Play width={20} height={20} /> },
  { key: "other", label: "Just need a room", blurb: "Something else — tell us about it", icon: <Icons.Home width={20} height={20} /> },
];

const SPACES = ["Gym", "Kitchen", "Dining area", "Main Meeting Room", "Room 201", "Nursery", "Office(s)", "Outdoors / grounds"];
const NEEDS = ["Tables & chairs", "Kitchen", "Microphone / sound", "Projector / screen", "Childcare space", "Lots of outlets"];

const EMPTY: BuildingUseRequestInput = {
  subType: "",
  subTypeLabel: "",
  requesterKind: "member",
  outsideOrg: "",
  contact: "",
  spaces: [],
  date: "",
  startTime: "",
  endTime: "",
  recurring: false,
  recurrenceNote: "",
  headcount: "",
  children: "",
  needs: [],
  accessPerson: "",
  hasKey: false,
  selfCleanup: false,
  paidActivity: false,
  insuranceAck: false,
  notes: "",
};

export function BuildingUseWizard({ requesterName }: { requesterName: string | null }) {
  const router = useRouter();
  const [form, setForm] = useState<BuildingUseRequestInput>(EMPTY);
  const [stepIndex, setStepIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const steps = useMemo<StepKey[]>(() => {
    const base: StepKey[] = ["type", "who", "spaces", "when", "people", "needs", "access"];
    if (form.requesterKind === "outside") base.push("extras");
    base.push("review");
    return base;
  }, [form.requesterKind]);

  const stepKey = steps[Math.min(stepIndex, steps.length - 1)];
  const isLast = stepKey === "review";

  function update<K extends keyof BuildingUseRequestInput>(key: K, value: BuildingUseRequestInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function toggleArray(key: "spaces" | "needs", value: string) {
    setForm((f) => {
      const arr = f[key];
      return { ...f, [key]: arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value] };
    });
  }

  function canAdvance(): boolean {
    switch (stepKey) {
      case "type":
        return !!form.subType;
      case "who":
        return form.requesterKind === "member" || !!form.outsideOrg?.trim();
      case "spaces":
        return form.spaces.length > 0;
      case "when":
        return !!form.date;
      default:
        return true;
    }
  }

  function back() {
    setError(null);
    if (stepIndex === 0) {
      router.push("/portal/requests");
      return;
    }
    setStepIndex((i) => i - 1);
  }
  async function next() {
    if (!canAdvance()) return;
    setError(null);
    if (!isLast) {
      setStepIndex((i) => i + 1);
      return;
    }
    setPending(true);
    const result = await createBuildingUseRequest(form);
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
        <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>Request sent</h3>
        <p style={{ margin: 0, fontSize: 14, color: "var(--gw-fg-muted)", maxWidth: 380, lineHeight: 1.6 }}>
          Thanks{requesterName ? `, ${requesterName.split(" ")[0]}` : ""}! The building committee will review
          your request and follow up. You can track it under Tasks &amp; Projects.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <Pill
            variant="ghost"
            size="sm"
            onClick={() => {
              setForm(EMPTY);
              setStepIndex(0);
              setSubmitted(false);
              setError(null);
            }}
          >
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
    <div className="rsd-card" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Progress */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)" }}>
          <span>Building use request</span>
          <span>
            Step {stepIndex + 1} of {steps.length}
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 100, background: "var(--gw-bg-elev)", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${((stepIndex + 1) / steps.length) * 100}%`,
              background: "var(--rsd-accent)",
              borderRadius: 100,
              transition: "width 220ms var(--gw-ease, ease)",
            }}
          />
        </div>
      </div>

      {renderStep()}

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

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
        <Pill variant="ghost" size="md" onClick={back} disabled={pending}>
          {stepIndex === 0 ? "Cancel" : "Back"}
        </Pill>
        <Pill variant="accent" size="md" onClick={next} disabled={pending || !canAdvance()}>
          {isLast ? (pending ? "Sending…" : "Send request") : "Next"}
        </Pill>
      </div>
    </div>
  );

  function renderStep() {
    switch (stepKey) {
      case "type":
        return (
          <Step title="What are you planning?" hint="Pick the closest match — we'll tailor the questions.">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {SUBTYPES.map((s) => (
                <OptionCard
                  key={s.key}
                  selected={form.subType === s.key}
                  onClick={() => setForm((f) => ({ ...f, subType: s.key, subTypeLabel: s.label }))}
                  icon={s.icon}
                  label={s.label}
                  blurb={s.blurb}
                />
              ))}
            </div>
          </Step>
        );

      case "who":
        return (
          <Step
            title="A little about you"
            hint={requesterName ? `You're signed in as ${requesterName}.` : "Tell us who's asking."}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <OptionCard
                selected={form.requesterKind === "member"}
                onClick={() => update("requesterKind", "member")}
                icon={<Icons.Home width={20} height={20} />}
                label="I'm part of MCC"
                blurb="A member, regular attender, or ministry of the church"
              />
              <OptionCard
                selected={form.requesterKind === "outside"}
                onClick={() => update("requesterKind", "outside")}
                icon={<Icons.Users width={20} height={20} />}
                label="An outside group or person"
                blurb="I'm requesting on behalf of someone outside the church"
              />
            </div>
            {form.requesterKind === "outside" && (
              <Input
                label="Group or host name *"
                value={form.outsideOrg}
                onChange={(e) => update("outsideOrg", e.target.value)}
                placeholder="e.g. The Nelson family, Omaha Quilters Guild"
              />
            )}
            <Input
              label="Best phone or email to reach you"
              value={form.contact}
              onChange={(e) => update("contact", e.target.value)}
              placeholder="Optional — helps us follow up"
            />
          </Step>
        );

      case "spaces":
        return (
          <Step title="Which space(s) do you need?" hint="Tap all that apply.">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SPACES.map((s) => (
                <Chip key={s} selected={form.spaces.includes(s)} onClick={() => toggleArray("spaces", s)}>
                  {s}
                </Chip>
              ))}
            </div>
          </Step>
        );

      case "when":
        return (
          <Step title="When do you need it?" hint="Include setup and cleanup time if you can.">
            <Input label="Date *" type="date" value={form.date} onChange={(e) => update("date", e.target.value)} />
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Input label="Start time" type="time" value={form.startTime} onChange={(e) => update("startTime", e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <Input label="End time" type="time" value={form.endTime} onChange={(e) => update("endTime", e.target.value)} />
              </div>
            </div>
            <CheckRow
              checked={!!form.recurring}
              onChange={(v) => update("recurring", v)}
              label="This happens on more than one day"
            />
            {form.recurring && (
              <Input
                label="Which days / how often?"
                value={form.recurrenceNote}
                onChange={(e) => update("recurrenceNote", e.target.value)}
                placeholder="e.g. every Tuesday in March, or Jan 27 / Feb 12 / Feb 24"
              />
            )}
          </Step>
        );

      case "people":
        return (
          <Step title="About how many people?" hint="A rough number is perfectly fine.">
            <Input
              label="Number of people"
              value={form.headcount}
              onChange={(e) => update("headcount", e.target.value)}
              placeholder="e.g. 30, or 20–50"
            />
            <Input
              label="How many children? (if any)"
              value={form.children}
              onChange={(e) => update("children", e.target.value)}
              placeholder="Optional"
            />
          </Step>
        );

      case "needs":
        return (
          <Step title="What will you need?" hint="Tap anything we should set out or provide.">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {NEEDS.map((n) => (
                <Chip key={n} selected={form.needs.includes(n)} onClick={() => toggleArray("needs", n)}>
                  {n}
                </Chip>
              ))}
            </div>
          </Step>
        );

      case "access":
        return (
          <Step title="Getting in & cleanup" hint="Help us plan the practical side.">
            <Input
              label="Who will open & lock up?"
              value={form.accessPerson}
              onChange={(e) => update("accessPerson", e.target.value)}
              placeholder="A name — or leave blank if you need us to"
            />
            <CheckRow
              checked={!!form.hasKey}
              onChange={(v) => update("hasKey", v)}
              label="I (or my helper) already have a key or door code"
            />
            <CheckRow
              checked={!!form.selfCleanup}
              onChange={(v) => update("selfCleanup", v)}
              label="We'll set up and clean up ourselves"
            />
          </Step>
        );

      case "extras":
        return (
          <Step title="A couple more things" hint="Because this is for an outside group.">
            <CheckRow
              checked={!!form.paidActivity}
              onChange={(v) => update("paidActivity", v)}
              label="We'll charge attendees, or this is a paid activity"
            />
            <CheckRow
              checked={!!form.insuranceAck}
              onChange={(v) => update("insuranceAck", v)}
              label="We can provide proof of insurance / sign a building-use waiver if needed"
            />
          </Step>
        );

      case "review":
        return (
          <Step title="Review & send" hint="Make sure this looks right, then send it to the committee.">
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <SummaryRow label="Plan" value={form.subTypeLabel} />
              <SummaryRow
                label="Requested by"
                value={form.requesterKind === "outside" ? `Outside group${form.outsideOrg ? ` — ${form.outsideOrg}` : ""}` : "MCC"}
              />
              <SummaryRow label="Space(s)" value={form.spaces.join(", ")} />
              <SummaryRow
                label="When"
                value={[
                  form.date,
                  [form.startTime, form.endTime].filter(Boolean).join("–"),
                  form.recurring ? `(recurring${form.recurrenceNote ? `: ${form.recurrenceNote}` : ""})` : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
              <SummaryRow
                label="People"
                value={form.headcount ? `${form.headcount}${form.children ? `, incl. ${form.children} children` : ""}` : ""}
              />
              <SummaryRow label="Needs" value={form.needs.join(", ")} />
            </div>
            <Textarea
              label="Anything else we should know?"
              rows={3}
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Optional"
            />
          </Step>
        );

      default:
        return null;
    }
  }
}

// ─── Step pieces ─────────────────────────────────────────────────

function Step({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--gw-fg)" }}>{title}</h3>
        {hint && <p style={{ margin: 0, fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.6 }}>{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function OptionCard({
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
        alignItems: "flex-start",
        gap: 12,
        textAlign: "left",
        padding: 14,
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
            width: 38,
            height: 38,
            borderRadius: 10,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: selected ? "var(--rsd-accent)" : "var(--gw-bg-elev)",
            color: selected ? "var(--rsd-accent-on)" : "var(--gw-fg-muted)",
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

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
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
        background: selected ? "var(--rsd-accent)" : "var(--gw-bg)",
        color: selected ? "var(--rsd-accent-on)" : "var(--gw-fg)",
        border: `1px solid ${selected ? "var(--rsd-accent)" : "var(--gw-border)"}`,
      }}
    >
      {children}
    </button>
  );
}

function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
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
          background: checked ? "var(--rsd-accent)" : "transparent",
          border: `1.5px solid ${checked ? "var(--rsd-accent)" : "var(--gw-border)"}`,
          color: "var(--rsd-accent-on)",
        }}
      >
        {checked && <Icons.CheckCircle width={14} height={14} />}
      </span>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--gw-fg)" }}>{label}</span>
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
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
