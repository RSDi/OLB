# Agent API (read-only)

Club agents can list game film without signing in as a person. There is no
env-var token. Super-admins mint hashed keys in **Settings → Agent keys**.

OLB does **not** auto-run migrations. Apply `0146_agent_keys.sql` in the
Supabase SQL editor after 0145, redeploy, then create a key. Merge #208
before the 0147 / 0148 film PRs. 0149 is reserved for email-archive; 0150
is already on main. To remove: `supabase/removal/0146_agent_keys_down.sql`.

## Create a key

1. Sign in as a super-admin.
2. **Settings → Agent keys**.
3. Type a **Name** (for example `Film reader`) and tap **Create key**.
4. **Copy key** now. The full key is shown once (`olb_ag_…`). We store a
   hash; there is no reveal later.
5. **Revoke** if it leaks.

Send it as a Bearer token:

```
Authorization: Bearer olb_ag_…
```

Wrong, missing, or revoked → `401 { "error": "unauthorized" }`. The endpoints
are GET only; POST/PATCH/DELETE are `405`.

## GET /api/agent/film

Every game film, newest game date first. Query:

- `team` — Directory team id, film slug (`14u-white`), or team name
- `from` / `to` — `YYYY-MM-DD` on the game date families entered

Game time is the upload timestamp (`uploadedAt`). Tip-off time is not stored.
`inStorage` is a live check of the private `game-film` bucket.
YouTube `status` is the agent spelling of the inbox: null → `not_sent`,
`queued`/`uploading` → `queued`, `done` → `uploaded`, `failed` → `failed`.
`youtube.privacy` is the club default from Settings → Film (not stored per
video). Playlist is the per-video override if set, otherwise the team's.

Responses never include team upload codes, OAuth tokens, storage paths, or
key hashes.

### Before (no route, no key)

```
GET /api/agent/film
→ 404
```

### After (test data)

```
GET /api/agent/film?team=14u-white&from=2026-10-01&to=2026-10-31
Authorization: Bearer olb_ag_test
```

```json
{
  "films": [
    {
      "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "team": {
        "id": "11111111-1111-1111-1111-111111111111",
        "name": "14U White",
        "slug": "14u-white"
      },
      "gameDate": "2026-10-18",
      "uploadedAt": "2026-10-18T18:00:00.000Z",
      "opponent": null,
      "inStorage": true,
      "youtube": {
        "status": "not_sent",
        "videoId": null,
        "url": null,
        "privacy": "unlisted",
        "playlistId": "PLhxMrx8aMydMcn6yvxHntL0ng9dN-ft1f",
        "playlistUrl": "https://www.youtube.com/playlist?list=PLhxMrx8aMydMcn6yvxHntL0ng9dN-ft1f",
        "updatedAt": null
      }
    },
    {
      "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "team": {
        "id": "11111111-1111-1111-1111-111111111111",
        "name": "14U White",
        "slug": "14u-white"
      },
      "gameDate": "2026-10-12",
      "uploadedAt": "2026-10-12T23:04:11.000Z",
      "opponent": "Elkhorn",
      "inStorage": true,
      "youtube": {
        "status": "uploaded",
        "videoId": "abc123XYZ",
        "url": "https://www.youtube.com/watch?v=abc123XYZ",
        "privacy": "unlisted",
        "playlistId": "PLhxMrx8aMydMcn6yvxHntL0ng9dN-ft1f",
        "playlistUrl": "https://www.youtube.com/playlist?list=PLhxMrx8aMydMcn6yvxHntL0ng9dN-ft1f",
        "updatedAt": "2026-10-12T23:40:00.000Z"
      }
    }
  ]
}
```

## GET /api/agent/film/health

YouTube connection (Settings → Film), default privacy, each team's playlist
id, whether migration 0145 is on the live schema, and counts:

- `notSent` — never queued (`youtube_status` is null)
- `stuck` — `queued` or `uploading`
- `failed` — `failed`

### After (test data)

```json
{
  "youtube": {
    "connected": true,
    "channelTitle": "Omaha Lightning Basketball",
    "connectedAt": "2026-10-10T12:00:00.000Z",
    "defaultPrivacy": "unlisted"
  },
  "playlists": {
    "migration0145Applied": true,
    "teams": [
      {
        "id": "11111111-1111-1111-1111-111111111111",
        "name": "14U White",
        "slug": "14u-white",
        "playlistId": "PLhxMrx8aMydMcn6yvxHntL0ng9dN-ft1f",
        "playlistUrl": "https://www.youtube.com/playlist?list=PLhxMrx8aMydMcn6yvxHntL0ng9dN-ft1f"
      }
    ]
  },
  "counts": {
    "notSent": 1,
    "stuck": 0,
    "failed": 0
  }
}
```
