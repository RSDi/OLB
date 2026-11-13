// Helpers for building PostgREST filter values.

// A pattern for .regexIMatch() (Postgres `~*`) that matches `value` and
// nothing else, ignoring case: regex metacharacters are escaped and the
// pattern is anchored at both ends. Used to look up a member by email, where
// the stored address may differ in case.
//
// Not .ilike(): LIKE reads `_` and `%` as wildcards, and PostgREST also turns
// every `*` in a like/ilike pattern into `%`, with no way to escape it, so an
// ilike pattern can't match every address literally.
export function exactRegex(value: string): string {
  return `^${value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")}$`;
}
