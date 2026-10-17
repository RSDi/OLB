# Game-film uploader

Families upload game video from their phones. Coaches collect it in the portal
under **Film**. Bytes go **browser → Supabase Storage** over TUS (resumable);
they never pass through Vercel.

This feature is namespaced so it can be torn out: `app/film`, `app/t`,
`app/portal/film`, `lib/film`, plus one sidebar link, one Settings tab, one
cron path, and migrations `0142_game_film.sql` and `0143_game_film_game.sql`.

## Go live (Jeff)

OLB does **not** auto-run migrations. Do these by hand, then redeploy.
This TUS create-on-the-server fix and the typed team-word codes do **not**
add a new migration; 0142 is still the one to run if it is not on the
project yet. Uniqueness of codes is checked in app code against the
existing hashes.

1. **Run the SQL** in the Supabase SQL editor:
   - `supabase/migrations/0142_game_film.sql` — `game_film_uploads`,
     `game_film_managers`, the private `game-film` bucket (20 GB limit),
     film columns on `olb_teams`, and `can_view_film()` / `can_manage_film()`.
     Safe to re-run if an earlier draft of 0142 already landed (columns and
     tables are `if not exists`).
   - `supabase/migrations/0143_game_film_game.sql` — adds `game_date`,
     `opponent`, `our_score`, and `their_score` on `game_film_uploads`. Run
     this after 0142. Idempotent (`if not exists`).
2. **Raise the project's Storage file-size limit** in the Supabase dashboard
   (Project Settings → Storage) if it is still the default (often 50 MB). The
   bucket is 20 GB; the project cap has to be at least that.
3. **Add env vars in Vercel** (Production, and Preview if you want to try it):
   - `FILM_SESSION_SECRET` — long random string (signs the team-unlock cookie)
   - `CRON_SECRET` — already used by the other crons; the cleanup job uses it too
   Existing `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
   reused to mint the signed upload token **and create the TUS upload** on
   the server. The phone never POSTs to Storage and never needs a JWT
   `anon` key. `NEXT_PUBLIC_SUPABASE_LEGACY_ANON_KEY` is not used. There is
   no `FILM_ADMIN_CODE` and no `TEAM_CODE_*` / `FILM_TEAMS`.
4. **Grant permissions.** Super-admins see **Film** and **Settings → Film**
   immediately. For everyone else, in Settings → Access Profiles or a person's
   extras:
   - **Game film** (`film_view`) — list and download every team
   - **Game film (manage)** (`film_manage`) — Settings → Film, mark moved and
     delete (also opens Film)
   Board does **not** get these automatically. A person can instead be a
   **video manager** for one team in Settings → Film (inbox + download for
   that team only).
5. **Redeploy** so Vercel picks up `FILM_SESSION_SECRET` and the `vercel.json`
   cron (`/api/cron/film-cleanup`, daily).
6. In **Settings → Film**, turn on each team, set its `/t/…` address, and
   **Generate code** (copy it — we only show it once). Send families
   `https://<site>/t/<slug>` or `/film` and that team's code.

Optional: add **Game film** → `/film` on the public site menu in Settings →
Website.

## Codes (hashed, shown once)

The family upload code is stored as `v1.<salt>.<sha256>`. We show the
plaintext **once** when someone with **Game film (manage)** sets or rotates
it. There is no reveal later — rotate if it's lost. Rotating bumps
`film_code_version`, which is part of the signed `olb_film` cookie, so phones
that already unlocked that team have to enter the new code.

`FILM_SESSION_SECRET` only signs that cookie. It is not mixed into the code
hash, so rotating the env var doesn't lock the codes.

## Teardown

1. Delete folders: `app/film`, `app/t`, `app/portal/film`, `lib/film`.
2. Remove the **Film** item from `app/components/PortalSidebar.tsx`, the
   `/portal/film` title in `app/portal/PortalShell.tsx`, `canViewFilm`
   plumbing in `app/portal/layout.tsx` / `lib/auth/viewer.ts`,
   `film_view` / `film_manage` in `lib/auth/access.ts`, `permissions.ts`,
   `guards.ts`, and the Settings → Film tab in `app/portal/settings/page.tsx`
   / `FilmSettingsTab.tsx`.
3. Remove the Film sections from `lib/help/guide.ts` and the film tours from
   `lib/help/tours.ts`.
4. Remove `/api/cron/film-cleanup` from `vercel.json` and
   `app/api/cron/film-cleanup`.
5. Remove `FILM_SESSION_SECRET` from Vercel and `.env.example`.
6. Remove `film` / `t` from `lib/website/content.ts` `RESERVED_SLUGS` and
   `/film` from `SITE_PAGES`.
7. In Supabase: drop table `game_film_uploads` and `game_film_managers`, drop
   functions `can_view_film` / `can_manage_film`, drop columns
   `film_slug` / `film_enabled` / `film_code_hash` / `film_code_version` on
   `olb_teams`, delete the `game-film` bucket (and its objects). No need to
   strip permission keys already stored on profiles.

## How it works

- `/film` — pick a team (Directory teams that are On, with a slug and a code).
- `/t/<slug>` — shared code (cookie HMAC with `FILM_SESSION_SECRET` and that
  team's `film_code_version`), then Uppy + TUS. Families fill in **Your name**,
  **Game date** (defaults to today in America/Chicago), **Opponent**, and
  optional **Our score** / **Their score**. The server validates (video
  MIME including iPhone `.mov`/HEVC, 20 GB, name required, per-IP rate
  limit), mints `createSignedUploadUrl` with the service role, and **POSTs
  the TUS create** to `{project}.storage.supabase.co/storage/v1/upload/resumable/sign`
  with `x-signature` set once. The phone only PATCHes 6 MiB chunks to that
  Location, sending `x-signature` once (never `Authorization` / `apikey`,
  and never from both Uppy `headers` and `onBeforeRequest` — XHR would
  comma-merge them into an invalid JWS).
- `/portal/film` — portal login + `film_view` / `film_manage` / video manager.
- **Settings → Film** — `film_manage` only.
- Cron deletes objects **30 days after** `status = moved`.
- Storage is a provider (`lib/film/storage.ts`): Supabase now; R2 and S3 are
  stubs. `lib/film/youtube.ts` is the later “publish to YouTube” hook.
