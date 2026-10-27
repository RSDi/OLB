// Shared check so a failed Supabase read is never treated as an empty list.

export function rowsOrThrow<T>(res: { data: T[] | null; error: { message?: string } | null }): T[] {
  if (res.error) throw new Error(res.error.message?.trim() || "Couldn't load registered programs.");
  return res.data ?? [];
}
