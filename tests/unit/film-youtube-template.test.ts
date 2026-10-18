import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_YOUTUBE_DESCRIPTION_TEMPLATE,
  DEFAULT_YOUTUBE_TITLE_TEMPLATE,
  filmResultKind,
  renderYoutubeTemplate,
  youtubeDescription,
  youtubeTemplateValues,
  youtubeTitle,
} from "../../lib/film/youtube-meta.ts";
import { parseFilmSlackChannelId } from "../../lib/film/slack-drafts.ts";

const game = {
  teamLabel: "14U Gold",
  opponent: "Elkhorn",
  gameDate: "2026-10-17",
};

test("default title is {dot} {team} vs {opponent} – {date} and extras start off", () => {
  assert.equal(DEFAULT_YOUTUBE_TITLE_TEMPLATE, "{dot} {team} vs {opponent} – {date}");
  assert.match(DEFAULT_YOUTUBE_DESCRIPTION_TEMPLATE, /\{result_line\}/);
  assert.match(DEFAULT_YOUTUBE_DESCRIPTION_TEMPLATE, /Final: \{our_score\}–\{their_score\}/);
  assert.match(DEFAULT_YOUTUBE_DESCRIPTION_TEMPLATE, /Watch: \{youtube_link\}/);
  assert.match(DEFAULT_YOUTUBE_DESCRIPTION_TEMPLATE, /Go Lightning! ⚡/);
  const values = youtubeTemplateValues(game);
  assert.equal(values.players, "");
  assert.equal(values.tournament, "");
  assert.equal(values.stats_book, "");
  assert.equal(values.playlist_link, "");
  assert.equal(filmResultKind(null, null), "none");
});

test("win title uses a green dot and no W/L text", () => {
  const title = youtubeTitle({ ...game, ourScore: 45, theirScore: 38 });
  assert.equal(title, "🟢 14U Gold vs Elkhorn – 10/17/2026");
  assert.doesNotMatch(title, /\bW\b|\bL\b|win|loss/i);
  const description = youtubeDescription({
    ...game,
    ourScore: 45,
    theirScore: 38,
    youtubeVideoId: "abc123",
  });
  assert.equal(
    description,
    [
      "14U Gold vs Elkhorn, 10/17/2026",
      "Congrats on the win!",
      "Final: 45–38",
      "Watch: https://www.youtube.com/watch?v=abc123",
      "Go Lightning! ⚡",
    ].join("\n")
  );
});

test("loss title uses a red dot and the loss result line", () => {
  const title = youtubeTitle({ ...game, ourScore: 30, theirScore: 41 });
  assert.equal(title, "🔴 14U Gold vs Elkhorn – 10/17/2026");
  assert.doesNotMatch(title, /\bW\b|\bL\b|win|loss/i);
  const description = youtubeDescription({ ...game, ourScore: 30, theirScore: 41 });
  assert.match(description, /Better luck next time!/);
  assert.match(description, /Final: 30–41/);
  assert.doesNotMatch(description, /Watch:/);
  assert.doesNotMatch(description, /Congrats/);
});

test("tie omits the dot, result line, and any leading space", () => {
  const title = youtubeTitle({ ...game, ourScore: 40, theirScore: 40 });
  assert.equal(title, "14U Gold vs Elkhorn – 10/17/2026");
  assert.equal(title.startsWith(" "), false);
  const description = youtubeDescription({ ...game, ourScore: 40, theirScore: 40, youtubeVideoId: "x" });
  assert.doesNotMatch(description, /Congrats|Better luck/);
  assert.match(description, /Final: 40–40/);
  assert.match(description, /Watch: https:\/\/www\.youtube\.com\/watch\?v=x/);
});

test("no score omits the dot, result line, and Final line", () => {
  const title = youtubeTitle(game);
  assert.equal(title, "14U Gold vs Elkhorn – 10/17/2026");
  const description = youtubeDescription(game);
  assert.equal(
    description,
    ["14U Gold vs Elkhorn, 10/17/2026", "Go Lightning! ⚡"].join("\n")
  );
  assert.doesNotMatch(description, /Final:/);
  assert.doesNotMatch(description, /Watch:/);
  assert.doesNotMatch(description, /\n\n/);
});

test("extras stay out unless the matching switch is on and data exists", () => {
  const off = youtubeDescription({
    ...game,
    ourScore: 45,
    theirScore: 38,
    youtubeVideoId: "abc",
    playlistId: "PLfilmplaylistidvalue1",
    players: ["Ada", "Bea"],
    tournamentName: "Heartland",
    statsBook: "https://example.test/stats",
  });
  assert.doesNotMatch(off, /Ada|Bea|Heartland|stats|playlist/);
  const on = youtubeDescription({
    ...game,
    ourScore: 45,
    theirScore: 38,
    youtubeVideoId: "abc",
    playlistId: "PLfilmplaylistidvalue1",
    players: ["Ada", "Bea"],
    extras: { includePlayers: true, includePlaylistLink: true },
  });
  assert.match(on, /Players: Ada, Bea/);
  assert.match(on, /Playlist: https:\/\/www\.youtube\.com\/playlist\?list=PLfilmplaylistidvalue1/);
  const missing = youtubeDescription({
    ...game,
    extras: { includePlayers: true, includeTournament: true, includeStatsBook: true, includePlaylistLink: true },
  });
  assert.doesNotMatch(missing, /Players:|Tournament:|Stats:|Playlist:/);
});

test("empty placeholder lines drop without leftover punctuation", () => {
  assert.equal(
    renderYoutubeTemplate("{team} vs {opponent} – {date}", youtubeTemplateValues({ teamLabel: "14U Gold" })),
    "14U Gold"
  );
  assert.equal(
    renderYoutubeTemplate("Watch: {youtube_link}\nGo Lightning! ⚡", youtubeTemplateValues(game)),
    "Go Lightning! ⚡"
  );
});

test("Slack channel IDs are C… or G… ids, not #names", () => {
  assert.deepEqual(parseFilmSlackChannelId(""), { ok: true, id: null });
  assert.deepEqual(parseFilmSlackChannelId("C0123456789"), { ok: true, id: "C0123456789" });
  assert.equal(parseFilmSlackChannelId("#14u-gold").ok, false);
  assert.equal(parseFilmSlackChannelId("not-a-channel").ok, false);
});

test("YouTube insert updates the description after the watch link exists and never auto-posts Slack", () => {
  const queue = readFileSync(join(import.meta.dirname, "../../lib/film/youtube.ts"), "utf8");
  const actions = readFileSync(join(import.meta.dirname, "../../lib/film/slack-actions.ts"), "utf8");
  const slack = readFileSync(join(import.meta.dirname, "../../lib/notifications/slack.ts"), "utf8");
  const settings = readFileSync(join(import.meta.dirname, "../../app/portal/settings/FilmSettingsTab.tsx"), "utf8");
  const inbox = readFileSync(join(import.meta.dirname, "../../app/portal/film/FilmInbox.tsx"), "utf8");
  assert.match(queue, /updateYoutubeVideoSnippet/);
  assert.match(queue, /createFilmSlackDraftIfNeeded/);
  assert.match(queue, /youtube\/v3\/videos\?part=snippet/);
  assert.doesNotMatch(queue, /postSlackPlainMessage|approveFilmSlackDraft/);
  assert.match(actions, /requireFilmSlackApprove\(\)/);
  assert.match(actions, /restoreDiscardedFilmSlackDraft/);
  assert.doesNotMatch(actions, /requireFilmManage\(\)/);
  assert.match(actions, /eq\("status", "pending"\)|status !== "pending"/);
  assert.match(actions, /claimFilmSlackDraft/);
  assert.match(actions, /alreadyPosted/);
  assert.match(slack, /export async function postSlackPlainMessage/);
  assert.match(settings, /YouTube title template/);
  assert.match(settings, /YouTube description template/);
  assert.match(settings, />\s*Save template\s*</);
  assert.match(settings, />Players list</);
  assert.match(settings, />Playlist link</);
  assert.match(settings, />Tournament name</);
  assert.match(settings, />Stats book</);
  assert.match(settings, /Slack channel ID/);
  assert.match(inbox, />Pending Slack posts</);
  assert.match(inbox, />Discarded Slack posts</);
  assert.match(inbox, />Approve</);
  assert.match(inbox, />Restore</);
  assert.match(inbox, />\s*Discard\s*</);
  assert.match(inbox, />Who played</);
  assert.match(inbox, /approveFilmSlackDraft/);
  assert.match(inbox, /restoreDiscardedFilmSlackDraft/);
});
