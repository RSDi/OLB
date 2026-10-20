@AGENTS.md

# Supabase table grants (Data API)

See AGENTS.md: every migration that creates a public table includes
`grant select, insert, update, delete on public.<t> to authenticated, service_role;`
in the same file (plus `grant select … to anon` only when anonymous reads are needed).
