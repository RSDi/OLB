"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Pill, Textarea } from "../../../components/ui";
import { ErrorNote, capStyle } from "../../payments/parts";
import { muted } from "../_shared/PlayerParts";
import { draftOffer, extendOffer, offerSpot, setWaitlistMark, withdrawOffer } from "../../../../lib/onboarding/actions";
import type { WaitlistInfo } from "../../../../lib/onboarding/board-data";

const linkBtn: React.CSSProperties = { border: "none", background: "none", padding: 0, fontSize: 12, fontWeight: 700, color: "var(--gw-fg)", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer" };

// The registration workflow's part of a waitlist card (0130): what the
// family told us on the waitlist form, coach notes from clinics, and Offer a
// spot with the offer's state. Shown while the workflow is on.
export function WorkflowPanel({ regId, name, info }: { regId: string; name: string; info: WaitlistInfo }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ to: string[]; subject: string; body: string; expires: string } | null>(null);
  const offer = info.offer;
  const open = offer?.status === "open";

  async function run(key: string, fn: () => Promise<{ error?: string; notice?: string }>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    const res = await fn();
    setBusy(null);
    if (res.error) return setError(res.error);
    if (res.notice) setNotice(res.notice);
    setDraft(null);
    router.refresh();
  }

  async function startOffer() {
    setBusy("draft");
    setError(null);
    const res = await draftOffer(regId);
    setBusy(null);
    if (res.error || !res.subject) return setError(res.error ?? "Couldn't start the offer.");
    setDraft({ to: res.to ?? [], subject: res.subject, body: res.body ?? "", expires: res.expires ?? "" });
  }

  const i = info.intake;
  return (
    <div data-tour="waitlist-workflow" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 12, background: "var(--gw-bg)", border: "1px solid var(--gw-border)" }}>
      {i && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          {(
            i.first_experience !== undefined || i.father || i.mother
              ? ([
                  ["Homeschooled", i.homeschooled ? "Yes" : "No"],
                  ["First Lightning experience", i.first_experience === true ? "Yes" : i.first_experience === false ? "No" : "Not answered"],
                  ...(i.athlete_phone || i.athlete_email
                    ? ([["Athlete contact", [i.athlete_phone, i.athlete_email].filter(Boolean).join(" · ")]] as [string, string][])
                    : []),
                  ...(i.father ? ([["Father", [i.father.first, i.father.last, i.father.email, i.father.phone].filter(Boolean).join(" · ")]] as [string, string][]) : []),
                  ...(i.mother ? ([["Mother", [i.mother.first, i.mother.last, i.mother.email, i.mother.phone].filter(Boolean).join(" · ")]] as [string, string][]) : []),
                ] as [string, string][])
              : ([
                  ["Homeschooled", i.homeschooled ? "Yes" : "No"],
                  ["Played before", i.experience || "Not answered"],
                  ["Friends on Lightning", i.friends || "None named"],
                  ["Heard about us", i.heard_from || "Not answered"],
                ] as [string, string][])
          ).map(([label, value]) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ ...capStyle, fontSize: 10 }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{value}</span>
            </div>
          ))}
          {i.notes && <div style={{ gridColumn: "1 / -1", ...muted }}>“{i.notes}”</div>}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <input type="checkbox" checked={!!info.clinicSeenOn} disabled={busy !== null} onChange={(e) => run("clinic", () => setWaitlistMark(regId, { clinicSeen: e.target.checked }))} />
          Seen at a clinic
        </label>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <input type="checkbox" checked={info.coachOk} disabled={busy !== null} onChange={(e) => run("coach", () => setWaitlistMark(regId, { coachOk: e.target.checked }))} />
          Coach 👍
        </label>
        <span style={{ flex: 1 }} />
        {open ? (
          <span style={{ ...muted, fontWeight: 700 }}>
            Offer sent · good until {offer.expires}{" "}
            <button type="button" style={linkBtn} disabled={busy !== null} onClick={() => run("extend", () => extendOffer(offer.id, 3))}>
              +3 days
            </button>{" "}
            <button type="button" style={{ ...linkBtn, color: "var(--gw-error)" }} disabled={busy !== null} onClick={() => confirm(`Take back ${name}'s offer? The link stops working.`) && run("withdraw", () => withdrawOffer(offer.id))}>
              Take back
            </button>
          </span>
        ) : (
          <>
            {offer?.status === "expired" && (
              <span style={muted}>
                Last offer ran out{" "}
                <button type="button" style={linkBtn} disabled={busy !== null} onClick={() => run("extend", () => extendOffer(offer.id, 3))}>
                  Reopen for 3 days
                </button>
              </span>
            )}
            {!draft && (
              <span data-tour="waitlist-offer" style={{ display: "inline-flex" }}>
                <Pill size="sm" variant="accent" onClick={startOffer} disabled={busy !== null}>
                  {busy === "draft" ? "Opening…" : "Offer a spot"}
                </Pill>
              </span>
            )}
          </>
        )}
      </div>

      {draft && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 10, borderTop: "1px solid var(--gw-border)" }}>
          <span style={muted}>
            To {draft.to.join(", ") || "nobody: there's no email on this registration"}. {"{link}"} becomes {name}&apos;s private registration link, good until {draft.expires}.
          </span>
          <Input label="Subject" value={draft.subject} maxLength={200} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          <Textarea label="Email" rows={10} value={draft.body} maxLength={4000} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          <div style={{ display: "flex", gap: 8 }}>
            <Pill variant="accent" disabled={busy !== null || draft.to.length === 0} onClick={() => run("offer", () => offerSpot(regId, draft.subject, draft.body))}>
              {busy === "offer" ? "Sending…" : "Send the offer"}
            </Pill>
            <Pill variant="ghost" disabled={busy !== null} onClick={() => setDraft(null)}>
              Cancel
            </Pill>
          </div>
        </div>
      )}
      {error && <ErrorNote text={error} />}
      {notice && <span style={{ ...muted, fontWeight: 700, color: "var(--gw-fg)" }}>{notice}</span>}
    </div>
  );
}
