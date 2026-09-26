// Age is always derived from DOB at render time — never stored (it goes stale).
export function ageFromDob(dob: string | null, ref: Date = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(dob + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  let age = ref.getFullYear() - d.getFullYear();
  const m = ref.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) age--;
  return age;
}

export function ageLabel(dob: string | null): string | null {
  const a = ageFromDob(dob);
  return a == null ? null : `Age ${a}`;
}
