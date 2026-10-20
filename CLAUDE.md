@AGENTS.md

# Supabase table grants (Data API)

See AGENTS.md: every migration that creates a public table, sequence, or
function includes grants in the same file —
`grant select, insert, update, delete on public.<t> to authenticated, service_role;`,
`grant usage, select on sequence public.<s> to authenticated, service_role;`,
`grant execute on function public.<f>(...) to authenticated, service_role;`
(plus `grant select … to anon` only when anonymous reads are needed).
Sequence/function grants must target anon, authenticated, or service_role.
Trigger functions are exempt. serial/identity columns need a grant on
`<table>_<column>_seq`.
