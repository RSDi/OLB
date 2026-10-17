"use client";
// Settings → Film: reuse Directory teams (olb_teams). Set the family upload
// slug and hashed code, turn a team on or off, and assign video managers.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icons } from "../../components/icons";
import { Input, Pill, Select } from "../../components/ui";
import { copyText } from "../../../lib/copy-text";
import { filmUploadUrl } from "../../../lib/film/upload-url";
import { FilmYoutubeCard } from "./FilmYoutubeCard";
import {
  addFilmManager,
  addFilmTeam,
  generateAndSetFilmTeamCode,
  loadFilmSettings,
  removeFilmManager,
  renameFilmTeam,
  saveFilmTeamPage,
  setFilmTeamCode,
  suggestFilmCode,
  type FilmMemberOption,
  type FilmSettingsTeam,
} from "../../../lib/film/team-actions";

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

export function FilmSettingsTab() {
  const [season, setSeason] = useState<string | null>(null);
  const [teams, setTeams] = useState<FilmSettingsTeam[]>([]);
  const [members, setMembers] = useState<FilmMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

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

  const load = useCallback(async () => apply(await loadFilmSettings()), [apply]);

  useEffect(() => {
    loadFilmSettings().then(apply);
  }, [apply]);

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
          <Link href="/portal/settings?tab=teams" prefetch={false} style={{ color: "var(--gw-fg)", fontWeight: 700 }}>
            Settings → Teams
          </Link>
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
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>No teams yet. Add one here, or in Settings → Teams.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {teams.map((t) => (
            <TeamCard key={t.id} team={t} members={members} onChanged={load} onError={setError} />
          ))}
        </div>
      )}
    </div>
  );
}

function TeamCard({
  team,
  members,
  onChanged,
  onError,
}: {
  team: FilmSettingsTeam;
  members: FilmMemberOption[];
  onChanged: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [slug, setSlug] = useState(team.slug);
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
  const uploadUrl = filmUploadUrl(origin, team.slug);

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
    <div data-tour="film-settings-row" className="rsd-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
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
            <div style={{ fontWeight: 800, fontSize: 15 }}>{team.label}</div>
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
          <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            Families can use this once a code is set and the team is On.
          </div>
        )}
      </div>

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
  );
}
