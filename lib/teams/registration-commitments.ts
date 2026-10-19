// Other-commitments answers on the public registration form. Copy is kept
// here so the live form does not import the click-through. Stored on
// olb_registrations.extra.commitments. Plain module, pure, so tests can run it.

export const COMMITMENTS_ASK =
  "Does your player have any other commitments this season, like football, debate, another sport or activity, that might pull them away from practices or games? We ask because consistent attendance matters to the whole team.";
export const COMMITMENTS_YES_FOLLOW_UP =
  "Thanks for letting us know! A coach or board member will review this and reach out to learn more. Is there anything you already know about your schedule that would help us work through it together?";
export const COMMITMENTS_NOTE_LABEL = "Activity name and conflicting days/times (optional)";
export const COMMITMENTS_FLAG = "Commitments";
// Same cap as the waitlist note on a registration (registration-actions).
export const NOTE_MAX = 500;

export type CommitmentsStored = { has: boolean; note: string | null };
export type CommitmentsResult = { ok: true; value: CommitmentsStored } | { ok: false; error: string };

export function emptyCommitments(): { commitments_has: boolean | null; commitments_note: string } {
  return { commitments_has: null, commitments_note: "" };
}

// After the homeschool step: the Yes/No question always, then the note only
// when they said Yes.
export function commitmentsSteps(has: boolean | null): string[] {
  return has === true ? ["commitments", "commitments-note"] : ["commitments"];
}

// Server-side clean of extra.commitments. Missing or non-boolean `has` is a
// validation problem (never a 500). On Yes the note is optional; if it is
// present it must be a string, trimmed, empty → null, more than NOTE_MAX
// rejected (exactly NOTE_MAX is allowed). On No the note is always null.
export function extraCommitments(has: unknown, note: unknown): CommitmentsResult {
  if (typeof has !== "boolean") {
    return { ok: false, error: "Please answer whether your player has other commitments this season." };
  }
  if (!has) return { ok: true, value: { has: false, note: null } };
  if (note == null || note === "") return { ok: true, value: { has: true, note: null } };
  if (typeof note !== "string") return { ok: false, error: "The commitments note has to be text." };
  const trimmed = note.trim();
  if (trimmed.length > NOTE_MAX) {
    return { ok: false, error: `Please keep the commitments note to ${NOTE_MAX} characters or fewer.` };
  }
  return { ok: true, value: { has: true, note: trimmed || null } };
}

export function commitmentsProblem(has: boolean | null, note: string = ""): string | null {
  const result = extraCommitments(has, note);
  return result.ok ? null : result.error;
}

// How much of a Yes note the registration summary shows. The stored note is
// the full trimmed text (up to NOTE_MAX); this is display-only.
export const NOTE_PREVIEW_MAX = 80;

export function commitmentsNotePreview(note: string): string {
  const trimmed = note.trim();
  if (trimmed.length <= NOTE_PREVIEW_MAX) return trimmed;
  return `${trimmed.slice(0, NOTE_PREVIEW_MAX).trimEnd()}…`;
}

export function commitmentsAdmin(extra: { commitments?: CommitmentsStored | null } | null | undefined): {
  show: boolean;
  flag: string | null;
  answer: "Yes" | "No" | null;
  note: string | null;
} {
  const stored = extra?.commitments;
  if (stored?.has === true) {
    return {
      show: true,
      flag: COMMITMENTS_FLAG,
      answer: "Yes",
      note: stored.note?.trim() || null,
    };
  }
  if (stored?.has === false) {
    return { show: false, flag: null, answer: "No", note: null };
  }
  return { show: false, flag: null, answer: null, note: null };
}

// Fixture-friendly markup for the admin flag (list) and the Yes/No answer
// plus note, or None on No (detail). The Registrations page renders the
// same values as chips/text. The whole page is Registrations-access only.
export function renderCommitmentsAdmin(
  extra: { commitments?: CommitmentsStored | null } | null | undefined,
  view: "list" | "detail"
): string {
  const v = commitmentsAdmin(extra);
  if (view === "list") return v.flag ? `<span class="commitments-flag">${v.flag}</span>` : "";
  if (v.answer === "Yes") {
    const note = escapeHtml(v.note || "No details given.");
    return `<span class="commitments-answer">Yes</span><p class="commitments-note">${note}</p>`;
  }
  if (v.answer === "No") return `<span class="commitments-answer">None</span>`;
  return "";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
