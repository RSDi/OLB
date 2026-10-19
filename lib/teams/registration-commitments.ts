// Other-commitments answers on the public registration form. Copy is kept
// here so the live form does not import the click-through. Stored on
// olb_registrations.extra.commitments. Plain module, pure, so tests can run it.

export const COMMITMENTS_ASK =
  "Does your player have any other commitments this season, like football, debate, another sport or activity, that might pull them away from practices or games? We ask because consistent attendance matters to the whole team.";
export const COMMITMENTS_YES_FOLLOW_UP =
  "Thanks for letting us know! A coach or board member will review this and reach out to learn more. Is there anything you already know about your schedule that would help us work through it together?";
export const COMMITMENTS_NOTE_LABEL = "Activity name and conflicting days/times (optional)";
export const COMMITMENTS_FLAG = "Commitments";

export type CommitmentsStored = { has: boolean; note: string | null };

export function emptyCommitments(): { commitments_has: boolean | null; commitments_note: string } {
  return { commitments_has: null, commitments_note: "" };
}

// After the homeschool step: the Yes/No question always, then the note only
// when they said Yes.
export function commitmentsSteps(has: boolean | null): string[] {
  return has === true ? ["commitments", "commitments-note"] : ["commitments"];
}

export function extraCommitments(has: boolean | null, note: string): CommitmentsStored | null {
  if (has !== true && has !== false) return null;
  return { has, note: has ? (note.trim() || null) : null };
}

export function commitmentsProblem(has: boolean | null): string | null {
  if (has === null) return "Please answer whether your player has other commitments this season.";
  return null;
}

export function commitmentsAdmin(extra: { commitments?: CommitmentsStored | null } | null | undefined): {
  show: boolean;
  flag: string | null;
  note: string | null;
} {
  const stored = extra?.commitments;
  const show = stored?.has === true;
  return {
    show,
    flag: show ? COMMITMENTS_FLAG : null,
    note: show ? (stored?.note?.trim() || null) : null,
  };
}

// Fixture-friendly markup for the admin flag (list) and the flag plus note
// (detail). The Registrations page renders the same values as chips/text.
export function renderCommitmentsAdmin(
  extra: { commitments?: CommitmentsStored | null } | null | undefined,
  view: "list" | "detail"
): string {
  const v = commitmentsAdmin(extra);
  if (!v.flag) return "";
  const flag = `<span class="commitments-flag">${v.flag}</span>`;
  if (view === "list" || !v.note) return flag;
  return `${flag}<p class="commitments-note">${escapeHtml(v.note)}</p>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
