"use client";

import { useEffect, useState } from "react";
import { Pill, Select } from "../../components/ui";
import {
  disconnectYoutubeChannel,
  loadYoutubeSettings,
  saveYoutubeChannelPrefs,
} from "../../../lib/film/youtube-actions";
import type { YoutubeConnection, YoutubePrivacy } from "../../../lib/film/youtube-meta";

const OUTCOMES: Record<string, string> = {
  connected: "YouTube is connected. New film uploads will go to that channel.",
  denied: "Google didn't grant access. Try Connect YouTube again.",
  failed: "Couldn't finish connecting YouTube. Try again.",
  "not-allowed": "You need Game film (manage) to connect YouTube.",
  "not-set-up": "YouTube isn't set up in Vercel yet (client id, secret, and token key).",
  preview: "Can't connect YouTube while previewing as someone else.",
};

export function FilmYoutubeCard() {
  const [configured, setConfigured] = useState(false);
  const [connection, setConnection] = useState<YoutubeConnection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("youtube");
    if (outcome && OUTCOMES[outcome]) setNotice(OUTCOMES[outcome]);
    loadYoutubeSettings().then((res) => {
      if ("error" in res) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setConfigured(res.configured);
      setConnection(res.connection);
      setLoading(false);
    });
  }, []);

  async function disconnect() {
    setBusy(true);
    setError(null);
    const res = await disconnectYoutubeChannel();
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.connection) setConnection(res.connection);
    setNotice("YouTube disconnected. New uploads stay in Film only.");
  }

  async function savePrefs(privacyStatus: YoutubePrivacy, madeForKids: boolean) {
    if (!connection) return;
    setConnection({ ...connection, privacyStatus, madeForKids });
    setBusy(true);
    setError(null);
    const res = await saveYoutubeChannelPrefs({ privacyStatus, madeForKids });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.connection) setConnection(res.connection);
  }

  return (
    <div data-tour="film-settings-youtube" className="rsd-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 15 }}>YouTube</div>
      <p style={{ margin: 0, fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5 }}>
        Connect the Omaha Lightning YouTube channel once. After a family finishes an upload, a background
        job sends the file to that channel. Default privacy is <strong>Unlisted</strong>. Unverified Google
        apps may force videos to <strong>Private</strong> until Google audits the app.
      </p>
      {notice && (
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--gw-success)" }}>{notice}</p>
      )}
      {error && (
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--gw-error)" }}>{error}</p>
      )}
      {loading ? (
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>Loading…</div>
      ) : !configured ? (
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
          Add <strong>FILM_YOUTUBE_CLIENT_ID</strong>, <strong>FILM_YOUTUBE_CLIENT_SECRET</strong>, and{" "}
          <strong>FILM_YOUTUBE_TOKEN_KEY</strong> in Vercel, then come back here to connect.
        </p>
      ) : connection?.connected ? (
        <>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            Connected{connection.channelTitle ? ` as ${connection.channelTitle}` : ""}.
          </div>
          <Select
            label="Privacy"
            value={connection.privacyStatus}
            disabled={busy}
            onChange={(e) => void savePrefs(e.target.value as YoutubePrivacy, connection.madeForKids)}
            help="Unlisted is the default. Public is searchable. Google may still force Private until the API app is verified."
          >
            <option value="unlisted">Unlisted</option>
            <option value="private">Private</option>
            <option value="public">Public</option>
          </Select>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={connection.madeForKids}
              disabled={busy}
              onChange={(e) => void savePrefs(connection.privacyStatus, e.target.checked)}
            />
            Made for kids
          </label>
          <div>
            <Pill size="sm" variant="ghost" disabled={busy} onClick={() => void disconnect()}>
              Disconnect YouTube
            </Pill>
          </div>
        </>
      ) : (
        <div>
          <Pill
            size="sm"
            variant="accent"
            disabled={busy}
            onClick={() => {
              window.location.href =
                "/api/film/youtube/connect?next=" + encodeURIComponent("/portal/settings?tab=film");
            }}
          >
            Connect YouTube
          </Pill>
        </div>
      )}
    </div>
  );
}
