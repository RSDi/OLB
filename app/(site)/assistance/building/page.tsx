"use client";
import { useState } from "react";
import { Icons } from "../../../components/icons";
import { Input, Textarea, Select } from "../../../components/ui";

const EVENT_TYPES = [
  { value: "", label: "Select event type..." },
  { value: "wedding", label: "Wedding / Reception" },
  { value: "party", label: "Party / Celebration" },
  { value: "basketball", label: "Basketball" },
  { value: "volleyball", label: "Volleyball" },
  { value: "meeting", label: "Meeting / Group Gathering" },
  { value: "other", label: "Other" },
];

const SPACES = [
  { value: "", label: "Select a space..." },
  { value: "main_meeting_room", label: "Main Meeting Room" },
  { value: "gym", label: "Gymnasium" },
  { value: "youth_room", label: "Youth Room" },
  { value: "classrooms", label: "Classrooms" },
  { value: "full_building", label: "Full Building" },
];

export default function BuildingRequestPage() {
  const [form, setForm] = useState({
    name: "", email: "", phone: "",
    eventType: "", space: "",
    date: "", startTime: "", endTime: "",
    attendance: "",
    notes: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise(r => setTimeout(r, 900));
    setLoading(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <section style={{ padding: "96px 24px", display: "flex", justifyContent: "center" }}>
        <div style={{
          maxWidth: 480, width: "100%", textAlign: "center",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "var(--rsd-accent-bg)",
            border: "1px solid rgba(108,140,89,.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--rsd-accent)",
          }}>
            <Icons.CheckCircle width={28} height={28}/>
          </div>
          <div>
            <h2 style={{ margin: "0 0 10px", fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>
              Request Received
            </h2>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.7, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
              Thank you! We&apos;ll review your building use request and follow up at the contact info you provided.
            </p>
          </div>
          <button
            onClick={() => { setSubmitted(false); setForm({ name: "", email: "", phone: "", eventType: "", space: "", date: "", startTime: "", endTime: "", attendance: "", notes: "" }); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "10px 20px", borderRadius: 100,
              background: "var(--rsd-accent)", color: "var(--rsd-accent-on)",
              fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer",
            }}
          >
            Submit Another Request
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      {/* Header */}
      <section style={{ padding: "72px 24px 48px", background: "var(--gw-bg)" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <h1 style={{
            margin: "0 0 12px",
            fontSize: "clamp(28px, 4vw, 40px)",
            fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.15,
          }}>
            Building Use Request
          </h1>
          <p style={{
            margin: 0,
            fontSize: 16, lineHeight: 1.75,
            color: "var(--gw-fg-muted)", fontWeight: 500,
          }}>
            Reserve the church building for a wedding, party, athletic event, or other gathering. We&apos;ll reach out to confirm availability and details.
          </p>
        </div>
      </section>

      {/* Form */}
      <section style={{ padding: "0 24px 96px", background: "var(--gw-bg)" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Info card */}
          <div style={{
            background: "var(--rsd-accent-bg)",
            border: "1px solid rgba(108,140,89,.2)",
            borderRadius: 12, padding: "16px 20px",
            display: "flex", gap: 12, alignItems: "flex-start",
          }}>
            <Icons.Info width={16} height={16} style={{ color: "var(--rsd-accent)", flexShrink: 0, marginTop: 2 }}/>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--gw-fg)", lineHeight: 1.6 }}>
              Requests are reviewed by staff before confirmation. You will be contacted within 2–3 business days.
              A member of the church must sponsor all building use requests.
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Contact */}
            <div className="rsd-card">
              <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Your Contact Info</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Input label="Full Name" value={form.name} onChange={set("name")} placeholder="Jane Smith" required />
                <div className="form-col-2">
                  <Input label="Email" type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" required />
                  <Input label="Phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="(555) 000-0000" />
                </div>
              </div>
            </div>

            {/* Event details */}
            <div className="rsd-card">
              <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Event Details</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="form-col-2">
                  <Select label="Event Type" value={form.eventType} onChange={set("eventType")} required>
                    {EVENT_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                  <Select label="Space Needed" value={form.space} onChange={set("space")} required>
                    {SPACES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </div>
                <div className="form-col-3">
                  <Input label="Date" type="date" value={form.date} onChange={set("date")} required />
                  <Input label="Start Time" type="time" value={form.startTime} onChange={set("startTime")} required />
                  <Input label="End Time" type="time" value={form.endTime} onChange={set("endTime")} required />
                </div>
                <Input label="Expected Attendance" type="number" value={form.attendance} onChange={set("attendance")} placeholder="e.g. 50" min="1" />
              </div>
            </div>

            {/* Notes */}
            <div className="rsd-card">
              <Textarea
                label="Additional Notes"
                value={form.notes}
                onChange={set("notes")}
                placeholder="Any setup needs, equipment requests, or other details we should know..."
                rows={4}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "13px 28px", borderRadius: 100,
                background: loading ? "var(--gw-bg-elev)" : "var(--rsd-accent)",
                color: loading ? "var(--gw-fg-muted)" : "var(--rsd-accent-on)",
                fontSize: 14, fontWeight: 700, border: "none", cursor: loading ? "not-allowed" : "pointer",
                transition: "background 150ms, color 150ms",
                alignSelf: "flex-start",
              }}
            >
              {loading ? "Submitting…" : <>Submit Request <Icons.ArrowRight width={14} height={14}/></>}
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
