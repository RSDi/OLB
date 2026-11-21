"use client";
// Settings → Film: reuse Directory teams (olb_teams). Set the family upload
// slug and hashed code, turn a team on or off, and assign video managers.

import { useCallback, useEffect, useState } from "react";
import { SettingsLink } from "../../components/SettingsLink";
import { Icons } from "../../components/icons";
import { Input, Pill, Select, Textarea } from "../../components/ui";
import { copyText } from "../../../lib/copy-text";
import { filmUploadUrl } from "../../../lib/film/upload-url";
import {
  filmTeamStatus,
  filterFilmTeams,
  groupFilmTeams,
  type FilmTeamFilter,
  type FilmTeamStatus,
} from "../../../lib/film/settings-list";
import { FilmYoutubeCard } from "./FilmYoutubeCard";
import {
  addFilmManager,
  addFilmTeam,
  generateAndSetFilmTeamCode,
  loadFilmSettings,
  removeFilmManager,
  renameFilmTeam,
  saveFilmTeamPage,
  saveFilmTeamWatch,
  saveFilmTeamPlaylist,
  saveFilmTeamTemplate,
  setFilmTeamCode,
  suggestFilmCode,
  type FilmMemberOption,
  type FilmSettingsTeam,
} from "../../../lib/film/team-actions";
import { loadYoutubeSettings } from "../../../lib/film/youtube-actions";
import {
  DEFAULT_YOUTUBE_DESCRIPTION_TEMPLATE,
  DEFAULT_YOUTUBE_TITLE_TEMPLATE,
  parseYoutubePlaylistId,
  youtubePlaylistUrl,
  type YoutubeChannelPlaylist,
} from "../../../lib/film/youtube-meta";

const STATUS_LABEL: Record<FilmTeamStatus, string> = { live: "Live", off: "Off", "no-code": "No code" };

function StatusBadge({ status }: { status: FilmTeamStatus }) {
  const tone = status === "live" ? "rsd-chip-success" : status === "off" ? "rsd-chip-warn" : "rsd-chip-error";
  return <span className={`rsd-chip ${tone}`}>{STATUS_LABEL[status]}</span>;
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div
      role="alert"
      style={{
        background: "var(--gw-error-bg)",
        border: "1px solid rgba(229,62,62,.25)",
        borderRadius: 10,
        padding: "12px 16px",
        fontSize: 13,
        color: "var(--gw-error)",
        fontWeight: 600,
      }}
    >
      {text}
    </div>
  );
}

export function FilmSettingsTab({ fullUi = false }: { fullUi?: boolean }) {
  const [season, setSeason] = useState<string | null>(null);
  const [teams, setTeams] = useState<FilmSettingsTeam[]>([]);
  const [members, setMembers] = useState<FilmMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [playlists, setPlaylists] = useState<YoutubeChannelPlaylist[]>([]);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilmTeamFilter>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadFilmSettings>>) => {
    if ("error" in res) {
      setError(res.error);
      setLoading(false);
      return;
    }
    setSeason(res.season);
    setTeams(res.teams);
    setMembers(res.members);
    setError(null);
    setLoading(false);
  }, []);

  const failedLoad = useCallback(() => {
    setError("Couldn't load. Refresh the page.");
    setLoading(false);
  }, []);

  const load = useCallback(() => loadFilmSettings().then(apply).catch(failedLoad), [apply, failedLoad]);

  useEffect(() => {
    loadFilmSettings().then(apply).catch(failedLoad);
    loadYoutubeSettings()
      .then((res) => {
        if ("error" in res) return;
        setPlaylists(res.playlists);
        setPlaylistError(res.playlistError);
      })
      .catch(() => setPlaylistError("Couldn't load. Refresh the page."));
  }, [apply, failedLoad]);

  async function add() {
    setError(null);
    const res = await addFilmTeam(newName);
    if (res.error) {
      setError(res.error);
      return;
    }
    setNewName("");
    setAdding(false);
    await load();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 760 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5, maxWidth: 560 }}>
          {season ? `${season} season. ` : ""}
          These are the same teams as{" "}
          <SettingsLink tab="teams">Settings → Teams</SettingsLink>
          . Turn a team on, set its family upload address and code, and optionally pick video managers who can
          open <strong>Film</strong> for that team only. Type a short word for the code (like <strong>white14</strong>)
          — we store it hashed and show it once.
        </div>
        {!adding && season && (
          <span data-tour="film-settings-add" style={{ display: "inline-flex" }}>
            <Pill variant="accent" size="sm" onClick={() => setAdding(true)}>
              <Icons.Plus width={14} height={14} /> New team
            </Pill>
          </span>
        )}
      </div>

      <FilmYoutubeCard />

      {playlistError && (
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>
          {playlistError}
        </p>
      )}

      {error && <ErrorBox text={error} />}

      {adding && (
        <form
          className="rsd-card"
          style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input label="Team name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="14U White" required />
          <div style={{ display: "flex", gap: 8 }}>
            <Pill type="submit" variant="accent" size="sm" disabled={!newName.trim()}>
              Create team
            </Pill>
            <Pill size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Pill>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>Loading…</div>
      ) : !season ? (
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>No season set up yet.</div>
      ) : teams.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>No teams yet. Add one here, or in <SettingsLink tab="teams">Settings → Teams</SettingsLink>.</div>
      ) : (
        <FilmTeamList
          teams={teams}
          filter={filter}
          setFilter={setFilter}
          query={query}
          setQuery={setQuery}
          openId={openId}
          setOpenId={setOpenId}
          renderTeam={(t, tourToggle) => (
            <TeamCard
              key={t.id}
              team={t}
              members={members}
              playlists={playlists}
              onChanged={load}
              onError={setError}
              open={openId === t.id}
              onToggle={() => setOpenId(openId === t.id ? null : t.id)}
              tourToggle={tourToggle}
              showWatch={fullUi}
            />
          )}
        />
      )}
    </div>
  );
}

function FilmTeamList({
  teams,
  filter,
  setFilter,
  query,
  setQuery,
  openId,
  setOpenId,
  renderTeam,
}: {
  teams: FilmSettingsTeam[];
  filter: FilmTeamFilter;
  setFilter: (f: FilmTeamFilter) => void;
  query: string;
  setQuery: (q: string) => void;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  renderTeam: (team: FilmSettingsTeam, tourToggle: boolean) => React.ReactNode;
}) {
  const live = teams.filter((t) => filmTeamStatus(t) === "live").length;
  const shown = filterFilmTeams(teams, filter, query);
  const sections = groupFilmTeams(shown);
  const chips: { key: FilmTeamFilter; label: string }[] = [
    { key: "all", label: `All ${teams.length}` },
    { key: "live", label: `Live ${live}` },
    { key: "setup", label: `Needs setup ${teams.length - live}` },
  ];
  const firstId = shown[0]?.id;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 200px", maxWidth: 260 }}>
          <Input aria-label="Find a team" placeholder="Find a team" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {chips.map((c) => (
          <Pill key={c.key} size="sm" variant={filter === c.key ? "accent" : "light"} onClick={() => setFilter(c.key)}>
            {c.label}
          </Pill>
        ))}
        {openId && (
          <Pill size="sm" variant="light" onClick={() => setOpenId(null)}>
            Collapse
          </Pill>
        )}
      </div>
      {sections.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>No teams match.</div>
      ) : (
        sections.map((section) => (
          <div key={section.heading} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              {section.heading}
            </div>
            {section.teams.map((t) => renderTeam(t, t.id === firstId))}
          </div>
        ))
      )}
    </div>
  );
}

function TeamCard({
  team,
  members,
  playlists,
  onChanged,
  onError,
  open,
  onToggle,
  tourToggle,
  showWatch,
}: {
  team: FilmSettingsTeam;
  members: FilmMemberOption[];
  playlists: YoutubeChannelPlaylist[];
  onChanged: () => Promise<void>;
  onError: (msg: string | null) => void;
  open: boolean;
  onToggle: () => void;
  tourToggle: boolean;
  showWatch: boolean;
}) {
  const [slug, setSlug] = useState(team.slug);
  const [watchOn, setWatchOn] = useState(team.watchPublic);
  const [watchCopied, setWatchCopied] = useState(false);
  const [enabled, setEnabled] = useState(team.enabled);
  const [name, setName] = useState(team.label);
  const [renaming, setRenaming] = useState(false);
  const [codeDraft, setCodeDraft] = useState(team.suggestedCode);
  const [settingCode, setSettingCode] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addManager, setAddManager] = useState("");
  const [origin] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));
  const [copied, setCopied] = useState(false);
  const [playlistDraft, setPlaylistDraft] = useState(team.youtubePlaylistId ?? "");
  const [titleTemplate, setTitleTemplate] = useState(team.youtubeTitleTemplate || DEFAULT_YOUTUBE_TITLE_TEMPLATE);
  const [descriptionTemplate, setDescriptionTemplate] = useState(
    team.youtubeDescriptionTemplate || DEFAULT_YOUTUBE_DESCRIPTION_TEMPLATE
  );
  const [includeStatsBook, setIncludeStatsBook] = useState(team.includeStatsBook);
  const [includePlayers, setIncludePlayers] = useState(team.includePlayers);
  const [includeTournament, setIncludeTournament] = useState(team.includeTournament);
  const [includePlaylistLink, setIncludePlaylistLink] = useState(team.includePlaylistLink);
  const [slackChannelId, setSlackChannelId] = useState(team.slackChannelId ?? "");
  const uploadUrl = filmUploadUrl(origin, team.slug);
  const watchUrl = origin && team.hasSlug ? `${origin}/watch/${team.slug}` : "";
  const parsedDraft = parseYoutubePlaylistId(playlistDraft);
  const selectedPlaylistId = parsedDraft.ok ? parsedDraft.id ?? "" : "";

  async function run<T extends { error?: string }>(fn: () => Promise<T>, ok?: (res: T) => void) {
    setBusy(true);
    onError(null);
    const res = await fn();
    setBusy(false);
    if (res.error) {
      onError(res.error);
      return;
    }
    ok?.(res);
    await onChanged();
  }

  const availableManagers = members.filter((m) => !team.managers.some((x) => x.userId === m.userId));

  return (
    <div data-tour="film-settings-row" className="rsd-card" style={{ padding: open ? 16 : "4px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <button
        type="button"
        data-tour={tourToggle ? "film-settings-team-toggle" : undefined}
        aria-expanded={open}
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "8px 0",
          border: 0,
          background: "none",
          color: "inherit",
          cursor: "pointer",
          textAlign: "left",
          flexWrap: "wrap",
        }}
      >
        {open ? <Icons.ChevronDown width={16} height={16} /> : <Icons.ChevronRight width={16} height={16} />}
        <span style={{ fontWeight: 800, fontSize: 15 }}>{team.label}</span>
        <StatusBadge status={filmTeamStatus(team)} />
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 10, fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)" }}>
          <span title={team.youtubePlaylistId ? "Has a YouTube playlist" : "No YouTube playlist"} style={{ opacity: team.youtubePlaylistId ? 1 : 0.45 }}>
            <Icons.Video width={14} height={14} style={{ verticalAlign: -2 }} /> Playlist
          </span>
          <span title={team.slackChannelId ? "Has a Slack channel" : "No Slack channel"} style={{ opacity: team.slackChannelId ? 1 : 0.45 }}>
            <Icons.MessageSquare width={14} height={14} style={{ verticalAlign: -2 }} /> Slack
          </span>
          <span title="Video managers" style={{ opacity: team.managers.length ? 1 : 0.45 }}>
            <Icons.Users width={14} height={14} style={{ verticalAlign: -2 }} /> {team.managers.length}
          </span>
        </span>
      </button>
      {open && (
        <>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        {renaming ? (
          <form
            style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => renameFilmTeam(team.id, name), () => setRenaming(false));
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} required style={{ minWidth: 180 }} />
            <Pill type="submit" size="sm" variant="accent" disabled={busy || !name.trim()}>
              Save name
            </Pill>
            <Pill size="sm" onClick={() => { setName(team.label); setRenaming(false); }}>
              Cancel
            </Pill>
          </form>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Pill size="sm" onClick={() => setRenaming(true)}>
                Rename
              </Pill>
              <Pill
                size="sm"
                variant={enabled ? "accent" : "light"}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const next = !enabled;
                    const res = await saveFilmTeamPage(team.id, { slug, enabled: next });
                    if (!res.error) setEnabled(next);
                    return res;
                  })
                }
              >
                {enabled ? "On" : "Off"}
              </Pill>
            </div>
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 220px" }}>
          <Input
            label="Upload address"
            help="The end of the family upload link. Changing it does not change the code."
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
          />
        </div>
        <Pill
          size="sm"
          disabled={busy || slug === team.slug}
          onClick={() => void run(() => saveFilmTeamPage(team.id, { slug, enabled }))}
        >
          Save address
        </Pill>
      </div>
      <div data-tour="film-settings-upload-url" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Upload link
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
          <code
            style={{
              fontSize: 13,
              fontWeight: 600,
              overflowWrap: "anywhere",
              wordBreak: "break-all",
              color: "var(--gw-fg)",
              flex: "1 1 280px",
            }}
          >
            {uploadUrl}
          </code>
          <Pill
            size="sm"
            variant="light"
            disabled={!uploadUrl}
            onClick={() => {
              void copyText(uploadUrl).then((ok) => {
                if (!ok) return;
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Pill>
        </div>
        {(!team.hasCode || !enabled) && (
          <div
            role="status"
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--gw-error)",
              background: "var(--gw-error-bg)",
              borderRadius: 8,
              padding: "8px 10px",
            }}
          >
            Not live yet. Families who open this link see “page not found” until{" "}
            {!team.hasCode && !enabled
              ? "you set an upload code and turn the team On"
              : !team.hasCode
                ? "you set an upload code"
                : "you turn the team On"}
            .
          </div>
        )}
      </div>

      {showWatch && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Team film page (preview)
          </div>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            One link where families watch every game, grouped by tournament and weekend. Anyone with the link can
            watch, so share it with the team only. Families can switch to any other team whose page is On, and{" "}
            {origin ? <code style={{ fontSize: 12 }}>{origin}/watch</code> : "/watch"} lists them all.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Pill
              size="sm"
              variant={watchOn ? "accent" : "light"}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const next = !watchOn;
                  const res = await saveFilmTeamWatch(team.id, next);
                  if (!res.error) setWatchOn(next);
                  return res;
                })
              }
            >
              {watchOn ? "On" : "Off"}
            </Pill>
            {watchOn && watchUrl && (
              <>
                <a href={watchUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" }}>
                  {watchUrl}
                </a>
                <Pill
                  size="sm"
                  variant="light"
                  onClick={() => {
                    void copyText(watchUrl).then((ok) => {
                      if (!ok) return;
                      setWatchCopied(true);
                      setTimeout(() => setWatchCopied(false), 1500);
                    });
                  }}
                >
                  {watchCopied ? "Copied" : "Copy"}
                </Pill>
              </>
            )}
          </div>
        </div>
      )}

      <div data-tour="film-settings-code" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Upload code
        </div>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          {team.hasCode
            ? "A code is set. We can't show it again — type a new word to rotate it (old family cookies stop working)."
            : "No code yet. Families can't upload until you set a short word and turn the team On."}{" "}
          Use 4–20 letters or numbers, like <strong>{team.suggestedCode || "white14"}</strong>. Codes are not case
          sensitive and must be unique across teams.
        </div>
        {revealed && (
          <div
            style={{
              background: "var(--gw-success-bg, #eef8f0)",
              border: "1px solid rgba(22,163,74,.25)",
              borderRadius: 10,
              padding: "12px 16px",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Copy this now. We won&apos;t show it again:{" "}
            <code style={{ fontSize: 15, fontWeight: 800 }}>{revealed}</code>
          </div>
        )}
        {settingCode ? (
          <form
            style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () => setFilmTeamCode(team.id, codeDraft),
                (res) => {
                  setRevealed(("code" in res && res.code) || codeDraft.trim().toLowerCase());
                  setCodeDraft(team.suggestedCode);
                  setSettingCode(false);
                }
              );
            }}
          >
            <div style={{ flex: "1 1 180px" }}>
              <Input
                label="New code"
                help="4–20 letters or numbers. Suggested from the team name. Not case sensitive."
                value={codeDraft}
                onChange={(e) => setCodeDraft(e.target.value.toLowerCase())}
                autoComplete="off"
                autoCapitalize="off"
                required
              />
            </div>
            <Pill
              size="sm"
              onClick={() => {
                void suggestFilmCode(team.id).then((res) => {
                  if (res.code) setCodeDraft(res.code);
                  if (res.error) onError(res.error);
                });
              }}
              type="button"
            >
              Suggest
            </Pill>
            <Pill type="submit" size="sm" variant="accent" disabled={busy || !codeDraft.trim()}>
              Save code
            </Pill>
            <Pill size="sm" onClick={() => setSettingCode(false)}>
              Cancel
            </Pill>
          </form>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Pill
              size="sm"
              disabled={busy}
              onClick={() => {
                setRevealed(null);
                setCodeDraft(team.suggestedCode);
                setSettingCode(true);
              }}
            >
              {team.hasCode ? "Rotate code" : "Set code"}
            </Pill>
            <Pill
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const res = await generateAndSetFilmTeamCode(team.id);
                  if (res.code) setRevealed(res.code);
                  return res;
                })
              }
            >
              Generate code
            </Pill>
          </div>
        )}
      </div>

      <details>
        <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 800, padding: "4px 0" }}>YouTube and Slack</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 10 }}>
          <div data-tour="film-settings-playlist" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Input
              label="YouTube playlist"
              help="Paste a playlist link or id (the list= value). New film for this team is added after YouTube upload finishes. Leave blank for none."
              value={playlistDraft}
              placeholder="https://www.youtube.com/playlist?list=PLhxMrx8aMydMcn6yvxHntL0ng9dN-ft1f"
              onChange={(e) => setPlaylistDraft(e.target.value)}
            />
            {playlists.length > 0 && (
              <Select
                label="Or pick from the channel"
                value={selectedPlaylistId}
                onChange={(e) => setPlaylistDraft(e.target.value)}
              >
                <option value="">Team default — none</option>
                {playlists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            )}
            {team.youtubePlaylistId && (
              <a href={youtubePlaylistUrl(team.youtubePlaylistId)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 700 }}>
                Open playlist
              </a>
            )}
            <div>
              <Pill
                size="sm"
                disabled={busy || playlistDraft === (team.youtubePlaylistId ?? "")}
                onClick={() =>
                  void run(
                    () => saveFilmTeamPlaylist(team.id, playlistDraft),
                    (res) => {
                      if ("youtubePlaylistId" in res) setPlaylistDraft(res.youtubePlaylistId ?? "");
                    }
                  )
                }
              >
                Save playlist
              </Pill>
            </div>
          </div>

          <div data-tour="film-settings-template" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Input
              label="YouTube title template"
              help="Placeholders: {dot} {team} {opponent} {date}. {dot} is a green circle on a win and a red circle on a loss; it is left off on a tie or when there is no score. No W/L text."
              value={titleTemplate}
              onChange={(e) => setTitleTemplate(e.target.value)}
            />
            <Textarea
              label="YouTube description template"
              help="One placeholder per line drops that line if it has nothing to show. {result_line} is Congrats on the win! or Better luck next time! {youtube_link} is filled in after the video is on YouTube. Extras: {players} {tournament} {stats_book} {playlist_link}."
              value={descriptionTemplate}
              onChange={(e) => setDescriptionTemplate(e.target.value)}
              rows={9}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Pill
                size="sm"
                onClick={() => {
                  setTitleTemplate(DEFAULT_YOUTUBE_TITLE_TEMPLATE);
                  setDescriptionTemplate(DEFAULT_YOUTUBE_DESCRIPTION_TEMPLATE);
                }}
              >
                Reset to default
              </Pill>
            </div>
          </div>

          <div data-tour="film-settings-extras" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Extra lines
            </div>
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5 }}>
              Off to start. When off, nothing extra appears in the title, description, or Slack text.
            </div>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={includePlayers}
                onChange={(e) => setIncludePlayers(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--rsd-accent)" }}
              />
              <span>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>Players list</span>
                <span style={{ display: "block", fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
                  Names from that game&apos;s lineup, or the season roster if no lineup is set.
                </span>
              </span>
            </label>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={includePlaylistLink}
                onChange={(e) => setIncludePlaylistLink(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--rsd-accent)" }}
              />
              <span>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>Playlist link</span>
                <span style={{ display: "block", fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
                  The team or per-video YouTube playlist URL.
                </span>
              </span>
            </label>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={includeTournament}
                onChange={(e) => setIncludeTournament(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--rsd-accent)" }}
              />
              <span>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>Tournament name</span>
                <span style={{ display: "block", fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
                  Ready as {"{tournament}"}, but film uploads do not store a tournament yet — the line stays off until they do.
                </span>
              </span>
            </label>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={includeStatsBook}
                onChange={(e) => setIncludeStatsBook(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--rsd-accent)" }}
              />
              <span>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>Stats book</span>
                <span style={{ display: "block", fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
                  Ready as {"{stats_book}"}. There is no stats-book field yet, so the line stays empty.
                </span>
              </span>
            </label>
          </div>

          <div data-tour="film-settings-slack" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Input
              label="Slack channel"
              help="Where Sparky posts after someone taps Approve on Film. In Slack, click the channel name → Copy link, and paste it here (the channel ID, starting with C, works too). Leave blank to keep Approve off."
              value={slackChannelId}
              onChange={(e) => setSlackChannelId(e.target.value)}
              placeholder="C0123456789"
              autoComplete="off"
            />
          </div>

          <div>
            <Pill
              size="sm"
              variant="accent"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  saveFilmTeamTemplate(team.id, {
                    titleTemplate,
                    descriptionTemplate,
                    includeStatsBook,
                    includePlayers,
                    includeTournament,
                    includePlaylistLink,
                    slackChannelId,
                  })
                )
              }
            >
              Save template
            </Pill>
          </div>

        </div>
      </details>

      <details>
        <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 800, padding: "4px 0" }}>Video managers ({team.managers.length})</summary>
        <div style={{ paddingTop: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Video managers
            </div>
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
              They can open Film and download this team&apos;s videos without the club-wide Game film permission. They
              can&apos;t mark moved or delete.
            </div>
            {team.managers.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {team.managers.map((m) => (
                  <span
                    key={m.userId}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "6px 10px",
                      borderRadius: 100,
                      background: "var(--gw-bg-elev)",
                      border: "1px solid var(--gw-border)",
                    }}
                  >
                    {m.name}
                    <button
                      type="button"
                      onClick={() => void run(() => removeFilmManager(team.id, m.userId))}
                      disabled={busy}
                      aria-label={`Remove ${m.name}`}
                      style={{ border: 0, background: "none", cursor: "pointer", fontWeight: 800, color: "var(--gw-fg-muted)" }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            {availableManagers.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: "1 1 200px" }}>
                  <Select label="Add a person" value={addManager} onChange={(e) => setAddManager(e.target.value)}>
                    <option value="">Choose…</option>
                    {availableManagers.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <Pill
                  size="sm"
                  disabled={busy || !addManager}
                  onClick={() =>
                    void run(
                      () => addFilmManager(team.id, addManager),
                      () => setAddManager("")
                    )
                  }
                >
                  Add
                </Pill>
              </div>
            )}
          </div>
        </div>
      </details>
        </>
      )}
    </div>
  );
}
