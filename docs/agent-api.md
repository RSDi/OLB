# Agent API

Club agents can list game film and import emails into Archives without
signing in as a person. There is no env-var token. Super-admins mint hashed
keys in **Settings → Agent keys**, and pick permissions:

- **Read game film** (`read`) — `GET /api/agent/film` and `GET /api/agent/film/health`
- **Import email archive** (`email_archive:write`) — `POST /api/agent/email-archive`

A film-only key cannot import mail. Keys minted before migration 0149 behave
as `{read}`.

**Depends on** hashed keys (`0146_agent_keys.sql`, #208). Apply
`0149_email_archive.sql` after 0148. 0150 (hosted tournaments, #175) is
already on main. OLB does **not** auto-run migrations.

## Create a key

1. Sign in as a super-admin.
2. **Settings → Agent keys**.
3. Type a **Name** (for example `Film reader`), tick the permissions it
   needs, and tap **Create key**.
4. **Copy key** now. The full key is shown once (`olb_ag_…`). We store a
   hash; there is no reveal later.
5. **Revoke** if it leaks.

Send it as a Bearer token:

```
Authorization: Bearer olb_ag_…
```

Wrong, missing, revoked, or missing the scope → `401 { "error": "unauthorized" }`.
Film routes are GET only (POST is `405`). Email archive is POST only.

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

## POST /api/agent/email-archive

Copy a Gmail thread into **Archives → Email**. Needs `email_archive:write`.
A `{read}`-only key returns 401. Apply `0149_email_archive.sql` first.

JSON body:

```json
{
  "gmailThreadId": "1a13bbc3cc52c26e",
  "sourceMailbox": "Lightning Gmail",
  "addedBy": "Jeff's agent",
  "links": [
    { "month": "2026-10", "agendaItemLabel": "Item 4 · Fundraising" }
  ],
  "messages": [
    {
      "gmailMessageId": "19abc",
      "from": "Lyla Santo <lyla.santo.08@gmail.com>",
      "to": ["LightningBasketballOmaha@gmail.com"],
      "sentAt": "2026-10-14T18:45:00Z",
      "subject": "Fundraising opportunity at Nelson Farm",
      "bodyText": "Hi! …",
      "bodyHtml": "<p>Hi!</p>",
      "snippet": "Nelson Produce Farm is looking for local sports teams…",
      "attachments": [
        { "filename": "flyer.pdf", "mime": "application/pdf", "contentBase64": "JVBERi0…" }
      ]
    }
  ]
}
```

`links[].month` is `YYYY-MM` (looks up that month's board meeting). You can
send `planningMeetingId` instead. If the meeting isn't saved yet, the thread
is still archived and the response lists a warning.

HTML is sanitized before storage (no scripts, no images). Attachments land
in the private `email-archive-files` bucket. The JSON response never includes
storage paths:

```json
{
  "thread": {
    "gmailThreadId": "1a13bbc3cc52c26e",
    "url": "/portal/archives/email/1a13bbc3cc52c26e",
    "messageCount": 1
  },
  "created": true,
  "warnings": []
}
```
