"use client";
import { useState } from "react";
import { Icons } from "../../../components/icons";
import { Input, Textarea, Select, Pill } from "../../../components/ui";

const LOCATIONS = [
  "Main Meeting Room", "Nursery", "Youth Room",
  "Children's Wing", "Offices", "Kitchen", "Restrooms",
  "Parking Lot", "Exterior / Grounds", "Other",
];

const PRIORITIES = [
  { value: "low", label: "Low — not urgent" },
  { value: "medium", label: "Medium — address soon" },
  { value: "high", label: "High — urgent" },
  { value: "emergency", label: "Emergency — immediate" },
];

function MaintenanceForm() {
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    await new Promise(r => setTimeout(r, 800));
    setPending(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 16, padding: "48px 24px", textAlign: "center",
        animation: "gw-fade-in 300ms var(--gw-ease)",
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: "var(--gw-success-bg)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--gw-success)",
        }}>
          <Icons.CheckCircle width={28} height={28}/>
        </div>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Request Submitted</h2>
        <p style={{ margin: 0, fontSize: 15, color: "var(--gw-fg-muted)", maxWidth: 380, lineHeight: 1.7 }}>
          Thank you! Your maintenance request has been received. Our facilities team will follow up with you shortly.
        </p>
        <Pill variant="accent" onClick={() => setSubmitted(false)}>Submit Another Request</Pill>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Select label="Location *" name="location" required>
        <option value="">Select a location…</option>
        {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
      </Select>

      <Select label="Priority *" name="priority" required>
        <option value="">Select priority…</option>
        {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
      </Select>

      <Textarea
        label="Description *"
        name="description"
        placeholder="Please describe the issue in detail — what is wrong, where exactly, and when you noticed it."
        rows={5}
        required
      />

      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "var(--gw-error-bg)",
          border: "1px solid rgba(229,62,62,.25)",
          borderRadius: 10, padding: "12px 16px",
          fontSize: 13, color: "var(--gw-error)", fontWeight: 600,
        }}>
          <Icons.AlertCircle width={16} height={16}/>
          {error}
        </div>
      )}

      <div style={{ paddingTop: 4 }}>
        <Pill type="submit" variant="accent" size="lg" disabled={pending} style={{ width: "100%", justifyContent: "center" }}>
          {pending ? "Submitting…" : "Submit Request"}
        </Pill>
        <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--gw-fg-muted)", textAlign: "center", lineHeight: 1.6 }}>
          For emergencies, please also contact the church office directly at (402) 000-0000.
        </p>
      </div>
    </form>
  );
}

export default function MaintenancePage() {
  return (
    <>
      {/* Header */}
      <section style={{
        padding: "72px 24px 56px",
        background: "var(--gw-bg-elev)",
        borderBottom: "1px solid var(--gw-border)",
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h1 style={{ margin: "0 0 16px", fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1.1 }}>
            Request
          </h1>
          <p style={{ margin: 0, fontSize: 18, color: "var(--gw-fg-muted)", lineHeight: 1.7, fontWeight: 500 }}>
            Notice something that needs attention? Submit a request and our facilities team will take care of it.
          </p>
        </div>
      </section>

      {/* Form */}
      <section style={{ padding: "64px 24px 80px", background: "var(--gw-bg)" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          {/* Priority guide */}
          <div className="rsd-card" style={{ marginBottom: 24, gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icons.Info width={16} height={16} style={{ color: "var(--rsd-accent)", flexShrink: 0 }}/>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)" }}>Priority Guide</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
              {[
                { label: "Emergency", desc: "Safety hazard, flooding, no heat/AC", chipClass: "rsd-chip-error" },
                { label: "High", desc: "Affects ministry this week", chipClass: "rsd-chip-warn" },
                { label: "Medium", desc: "Needs attention soon", chipClass: "rsd-chip-mute" },
                { label: "Low", desc: "Cosmetic or non-urgent", chipClass: "rsd-chip-success" },
              ].map(p => (
                <div key={p.label} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span className={`rsd-chip ${p.chipClass}`} style={{ alignSelf: "flex-start" }}>{p.label}</span>
                  <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>{p.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Form card */}
          <div className="rsd-card" style={{ gap: 0 }}>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700 }}>Submit a Request</h2>
              <p style={{ margin: 0, fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
                All fields marked * are required. Your request goes directly to our facilities team.
              </p>
            </div>
            <MaintenanceForm />
          </div>
        </div>
      </section>
    </>
  );
}
