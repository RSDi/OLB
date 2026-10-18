import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  agentPayloadLeaks,
  agentYoutubeStatus,
  parseFilmListQuery,
  teamMatchesFilter,
  toAgentFilm,
  toAgentFilmHealth,
  youtubePrivacy,
  type AgentFilmRow,
  type AgentTeamRow,
} from "../../lib/agent/film.ts";
import { columnMissing, playlistColumnsMissing, relationMissing } from "../../lib/agent/schema.ts";

const WHITE: AgentTeamRow = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "14U White",
  slug: "14u-white",
  playlistId: "PLhxMrx8aMydMcn6yvxHntL0ng9dN-ft1f",
};

function row(partial: Partial<AgentFilmRow> & Pick<AgentFilmRow, "id">): AgentFilmRow {
  return {
    team: "14u-white",
    team_id: WHITE.id,
    storage_path: "14u-white/2026/10/clip.mov",
    created_at: "2026-10-12T23:04:11.000Z",
    game_date: "2026-10-12",
    opponent: "Elkhorn",
    youtube_status: "done",
    youtube_video_id: "abc123XYZ",
    youtube_updated_at: "2026-10-12T23:40:00.000Z",
    youtube_playlist_id: null,
    ...partial,
  };
}

const AFTER_LIST = {
  films: [
    toAgentFilm(row({
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      created_at: "2026-10-18T18:00:00.000Z",
      game_date: "2026-10-18",
      opponent: null,
      youtube_status: null,
      youtube_video_id: null,
      youtube_updated_at: null,
    }), { team: WHITE, inStorage: true, privacy: "unlisted" }),
    toAgentFilm(row({ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }), {
      team: WHITE,
      inStorage: true,
      privacy: "unlisted",
    }),
  ],
};

const AFTER_HEALTH = toAgentFilmHealth({
  connected: true,
  channelTitle: "Omaha Lightning Basketball",
  connectedAt: "2026-10-10T12:00:00.000Z",
  defaultPrivacy: "unlisted",
  migration0145Applied: true,
  teams: [WHITE],
  notSent: 1,
  stuck: 0,
  failed: 0,
});

test("YouTube inbox statuses map to not_sent / queued / uploaded / failed", () => {
  assert.equal(agentYoutubeStatus(null), "not_sent");
  assert.equal(agentYoutubeStatus(undefined), "not_sent");
  assert.equal(agentYoutubeStatus("queued"), "queued");
  assert.equal(agentYoutubeStatus("uploading"), "queued");
  assert.equal(agentYoutubeStatus("done"), "uploaded");
  assert.equal(agentYoutubeStatus("failed"), "failed");
});

test("list query accepts team and a YYYY-MM-DD range", () => {
  assert.deepEqual(parseFilmListQuery(new URLSearchParams("")), { team: null, from: null, to: null });
  assert.deepEqual(parseFilmListQuery(new URLSearchParams("team=14u-white&from=2026-10-01&to=2026-10-31")), {
    team: "14u-white",
    from: "2026-10-01",
    to: "2026-10-31",
  });
  assert.deepEqual(parseFilmListQuery(new URLSearchParams("from=10/01/2026")), { error: "from must be YYYY-MM-DD." });
  assert.deepEqual(parseFilmListQuery(new URLSearchParams("from=2026-10-31&to=2026-10-01")), {
    error: "from cannot be after to.",
  });
  assert.equal(teamMatchesFilter(WHITE, "14u-white"), true);
  assert.equal(teamMatchesFilter(WHITE, "14U White"), true);
  assert.equal(teamMatchesFilter(WHITE, WHITE.id), true);
  assert.equal(teamMatchesFilter(WHITE, "gold"), false);
});

test("after: list payload for test data (pinned example)", () => {
  assert.deepEqual(AFTER_LIST, {
    films: [
      {
        id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        team: { id: WHITE.id, name: "14U White", slug: "14u-white" },
        gameDate: "2026-10-18",
        uploadedAt: "2026-10-18T18:00:00.000Z",
        opponent: null,
        inStorage: true,
        youtube: {
          status: "not_sent",
          videoId: null,
          url: null,
          privacy: "unlisted",
          playlistId: "PLhxMrx8aMydMcn6yvxHntL0ng9dN-ft1f",
          playlistUrl: "https://www.youtube.com/playlist?list=PLhxMrx8aMydMcn6yvxHntL0ng9dN-ft1f",
          updatedAt: null,
        },
      },
      {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        team: { id: WHITE.id, name: "14U White", slug: "14u-white" },
        gameDate: "2026-10-12",
        uploadedAt: "2026-10-12T23:04:11.000Z",
        opponent: "Elkhorn",
        inStorage: true,
        youtube: {
          status: "uploaded",
          videoId: "abc123XYZ",
          url: "https://www.youtube.com/watch?v=abc123XYZ",
          privacy: "unlisted",
          playlistId: "PLhxMrx8aMydMcn6yvxHntL0ng9dN-ft1f",
          playlistUrl: "https://www.youtube.com/playlist?list=PLhxMrx8aMydMcn6yvxHntL0ng9dN-ft1f",
          updatedAt: "2026-10-12T23:40:00.000Z",
        },
      },
    ],
  });
  assert.deepEqual(agentPayloadLeaks(AFTER_LIST), []);
});

test("a missing file is inStorage false; a missing opponent stays null", () => {
  const film = toAgentFilm(row({ id: "c", opponent: null, youtube_status: "failed", youtube_video_id: null }), {
    team: WHITE,
    inStorage: false,
    privacy: "private",
  });
  assert.equal(film.inStorage, false);
  assert.equal(film.opponent, null);
  assert.equal(film.youtube.status, "failed");
  assert.equal(film.youtube.privacy, "private");
  assert.equal(film.youtube.url, null);
});

test("after: health payload for test data (pinned example)", () => {
  assert.deepEqual(AFTER_HEALTH, {
    youtube: {
      connected: true,
      channelTitle: "Omaha Lightning Basketball",
      connectedAt: "2026-10-10T12:00:00.000Z",
      defaultPrivacy: "unlisted",
    },
    playlists: {
      migration0145Applied: true,
      teams: [
        {
          id: WHITE.id,
          name: "14U White",
          slug: "14u-white",
          playlistId: "PLhxMrx8aMydMcn6yvxHntL0ng9dN-ft1f",
          playlistUrl: "https://www.youtube.com/playlist?list=PLhxMrx8aMydMcn6yvxHntL0ng9dN-ft1f",
        },
      ],
    },
    counts: { notSent: 1, stuck: 0, failed: 0 },
  });
  assert.deepEqual(agentPayloadLeaks(AFTER_HEALTH), []);
  assert.equal(youtubePrivacy("public"), "public");
  assert.equal(youtubePrivacy("weird"), "unlisted");
});

test("health with YouTube disconnected and 0145 not applied", () => {
  const body = toAgentFilmHealth({
    connected: false,
    channelTitle: null,
    connectedAt: null,
    defaultPrivacy: null,
    migration0145Applied: false,
    teams: [{ ...WHITE, playlistId: null }],
    notSent: 4,
    stuck: 2,
    failed: 1,
  });
  assert.equal(body.youtube.connected, false);
  assert.equal(body.youtube.defaultPrivacy, "unlisted");
  assert.equal(body.playlists.migration0145Applied, false);
  assert.equal(body.playlists.teams[0]?.playlistId, null);
  assert.deepEqual(body.counts, { notSent: 4, stuck: 2, failed: 1 });
  assert.deepEqual(agentPayloadLeaks(body), []);
});

test("payload leak scan catches tokens, team codes, and storage paths", () => {
  assert.deepEqual(
    agentPayloadLeaks({
      youtube: { refresh_token_enc: "nope", status: "uploaded" },
      film_code_hash: "v1.x.y",
      storage_path: "secret/path",
    }),
    ["youtube.refresh_token_enc", "film_code_hash", "storage_path"],
  );
});

test("0145 schema probe is a column-missing check, not a catalog dump", () => {
  assert.equal(playlistColumnsMissing("column youtube_playlist_id does not exist"), true);
  assert.equal(columnMissing("Could not find the 'youtube_playlist_id' column of 'olb_teams' in the schema cache", "youtube_playlist_id"), true);
  assert.equal(relationMissing('relation "public.olb_agent_keys" does not exist', "olb_agent_keys"), true);
  assert.equal(
    relationMissing("Could not find the table 'public.olb_agent_keys' in the schema cache", "olb_agent_keys"),
    true,
  );
  assert.equal(relationMissing("column youtube_playlist_id does not exist", "olb_agent_keys"), false);
  const load = readFileSync(join(import.meta.dirname, "../../lib/agent/film-load.ts"), "utf8");
  assert.match(load, /select\("youtube_playlist_id"\)/);
  assert.doesNotMatch(load, /information_schema/);
  assert.doesNotMatch(load, /pg_catalog/);
  assert.doesNotMatch(load, /getYoutubeConnectionSecret/);
  assert.doesNotMatch(load, /film_code_hash/);
});

test("before: there was no agent film route; after: GET only under /api/agent/film", () => {
  const film = readFileSync(join(import.meta.dirname, "../../app/api/agent/film/route.ts"), "utf8");
  const health = readFileSync(join(import.meta.dirname, "../../app/api/agent/film/health/route.ts"), "utf8");
  assert.match(film, /listAgentFilms/);
  assert.match(health, /loadAgentFilmHealth/);
  assert.doesNotMatch(film + health, /export async function POST/);
});
