# Archived migrations

These are the migrations (0001–0086) that built this schema before the site
moved to `../migrations/0000_baseline.sql`, a dump of the schema as it stood
after all of them. They're kept for their history and header comments, which
explain why tables, policies and triggers look the way they do. Code comments
and later migrations still refer to them by number.

Nothing applies them anymore. Supabase (the CLI and preview branches) only
reads `../migrations/`, and they can't be replayed on top of the baseline
anyway: `0005` reads `maintenance_requests.location`, which `0007` dropped.

New migrations go in `../migrations/`, numbered after the highest one there.
