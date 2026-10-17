# Game-film uploader

Families upload game video from their phones. Coaches collect it in the portal
under **Film**. Bytes go **browser → Supabase Storage** over TUS (resumable);
they never pass through Vercel.

This feature is namespaced so it can be torn out: `app/film`, `app/t`,
`app/portal/film`, `lib/film`, plus one sidebar link, one cron path, and
migration `0142_game_film.sql`.

## Go live (Jeff)

OLB does **not** auto-run migrations. Do these by hand, then redeploy.

1. **Run the SQL** in the Supabase SQL editor: `supabase/migrations/0142_game_film.sql`.
   That creates `game_film_uploads`, the private `game-film` bucket (20 GB
   limit), and `can_view_film()` / `can_manage_film()`.
2. **Raise the project's Storage file-size limit** in the Supabase dashboard
   (Project Settings → Storage) if it is still the default (often 50 MB). The
   bucket is 20 GB; the project cap has to be at least that.
3. **Add env vars in Vercel** (Production, and Preview if you want to try it):
   - `FILM_SESSION_SECRET` — long random string (signs the team-unlock cookie)
   - `TEAM_CODE_14U_WHITE` and `TEAM_CODE_14U_GOLD` — pick the shared codes
     families will type (or add more teams; see below)
   - `CRON_SECRET` — already used by the other crons; the cleanup job uses it too
   Existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` are reused. There is no `FILM_ADMIN_CODE`.
4. **Grant permissions.** Super-admins see **Film** immediately. For everyone
   else, in Settings → Access Profiles or a person's extras:
   - **Game film** (`film_view`) — list and download
   - **Game film (manage)** (`film_manage`) — mark moved and delete (also
     opens Film)
   Board does **not** get these automatically.
5. **Redeploy** so Vercel picks up the env vars and `vercel.json` cron
   (`/api/cron/film-cleanup`, daily).
6. Send families `https://<site>/t/14u-white` (or `/film` to pick a team) and
   that team's code.

Optional: `FILM_TEAMS=14u-white:14U White,16u-black:16U Black` plus matching
`TEAM_CODE_*` vars. Optional: add **Game film** → `/film` on the public site
menu in Settings → Website.

## Teardown

1. Delete folders: `app/film`, `app/t`, `app/portal/film`, `lib/film`.
2. Remove the **Film** item from `app/components/PortalSidebar.tsx`, the
   `/portal/film` title in `app/portal/PortalShell.tsx`, `canViewFilm` plumbing
   in `app/portal/layout.tsx` / `lib/auth/viewer.ts`, and `film_view` /
   `film_manage` in `lib/auth/access.ts`, `permissions.ts`, `guards.ts`.
3. Remove the Film section from `lib/help/guide.ts` and the film tour from
   `lib/help/tours.ts`.
4. Remove `/api/cron/film-cleanup` from `vercel.json` and
   `app/api/cron/film-cleanup`.
5. Remove film env vars from Vercel and `.env.example`.
6. Remove `film` / `t` from `lib/website/content.ts` `RESERVED_SLUGS` and
   `/film` from `SITE_PAGES`.
7. In Supabase: drop table `game_film_uploads`, drop functions
   `can_view_film` / `can_manage_film`, delete the `game-film` bucket (and its
   objects). No need to strip permission keys already stored on profiles.

## How it works

- `/film` — pick a team (only teams with a `TEAM_CODE_*` set).
- `/t/<team>` — shared code (cookie HMAC with `FILM_SESSION_SECRET`), then
  Uppy + TUS to `{project}.storage.supabase.co`. The server only validates
  (video MIME including iPhone `.mov`/HEVC, 20 GB, name required, per-IP
  rate limit) and mints `createSignedUploadUrl`. The client sends that token
  as `x-signature`.
- `/portal/film` — portal login + `film_view` / `film_manage`.
- Cron deletes objects **30 days after** `status = moved`.
- Storage is a provider (`lib/film/storage.ts`): Supabase now; R2 and S3 are
  stubs. `lib/film/youtube.ts` is the later “publish to YouTube” hook.
