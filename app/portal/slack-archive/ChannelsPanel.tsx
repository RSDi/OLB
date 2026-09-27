"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "../../components/icons";
import { Input, Pill } from "../../components/ui";
import { addArchiveChannel, refreshArchiveAccessNow, setArchiveChannelActive } from "../../../lib/slack-archive/channel-actions";
import type { ArchiveChannel } from "../../../lib/slack-archive/data";

// Super admins get the registry controls (add, deactivate, sync status,
// access status); everyone else just gets the list of channels they can read.
export function ChannelsPanel({ channels, isAdmin }: { channels: ArchiveChannel[]; isAdmin: boolean }) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleAdd(channelId: string, label: string) {
    setError(null);
    startTransition(async () => {
      const result = await addArchiveChannel(channelId, label);
      if (result.error) {
        setError(result.error);
        return;
      }
      setAdding(false);
      router.refresh();
    });
  }

  function handleRefreshAccess() {
    setError(null);
    setAccessMessage(null);
    startTransition(async () => {
      const result = await refreshArchiveAccessNow();
      if (result.error) setError(result.error);
      else setAccessMessage(result.message ?? null);
      router.refresh();
    });
  }

  function handleToggle(id: string, active: boolean) {
    startTransition(async () => {
      const result = await setArchiveChannelActive(id, active);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {isAdmin && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 520 }}>
            Registered channels sync nightly. Add a channel by its Slack ID (in Slack:
            open the channel → View channel details → ID at the bottom). Who can see
            each channel follows Slack: private channels only show up for their members,
            re-checked every night — or right away with Refresh access.
          </div>
          <div data-tour="archive-admin" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Pill variant="ghost" size="sm" onClick={handleRefreshAccess} disabled={pending}>
              {pending ? "Working…" : "Refresh access"}
            </Pill>
            {!adding && (
              <Pill variant="accent" size="sm" onClick={() => setAdding(true)}>
                <Icons.Plus width={14} height={14} /> Add channel
              </Pill>
            )}
          </div>
        </div>
      )}

      {accessMessage && (
        <div style={{ fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 600 }}>{accessMessage}</div>
      )}

      {error && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "var(--gw-error-bg)", border: "1px solid rgba(229,62,62,.25)",
            borderRadius: 10, padding: "12px 16px", fontSize: 13,
            color: "var(--gw-error)", fontWeight: 600,
          }}
        >
          <Icons.AlertCircle width={16} height={16} />
          {error}
        </div>
      )}

      {adding && (
        <AddChannelForm
          pending={pending}
          onCancel={() => { setAdding(false); setError(null); }}
          onSubmit={handleAdd}
        />
      )}

      {channels.length === 0 ? (
        <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            {isAdmin ? "No channels registered yet." : "No channels to show yet."}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {channels.map((c) => (
            <ChannelRow key={c.id} channel={c} isAdmin={isAdmin} pending={pending} onToggle={handleToggle} />
          ))}
        </div>
      )}
    </div>
  );
}

// What a super admin needs to know about who can see a channel. A channel
// whose privacy Slack hasn't confirmed is hidden from everyone but super
// admins (migration 0084 fails closed), so that case is called out loudly.
function accessLabel(channel: ArchiveChannel): { text: string; warn: boolean } {
  if (channel.access_error) {
    return {
      text: channel.is_private === null
        ? `Hidden from members — access check failed: ${channel.access_error}`
        : `Access check failed (keeping last known access): ${channel.access_error}`,
      warn: true,
    };
  }
  if (channel.is_private === null) return { text: "Hidden from members until access is checked", warn: true };
  return { text: channel.is_private ? "Private — channel members only" : "Visible to all members", warn: false };
}

function ChannelRow({
  channel,
  isAdmin,
  pending,
  onToggle,
}: {
  channel: ArchiveChannel;
  isAdmin: boolean;
  pending: boolean;
  onToggle: (id: string, active: boolean) => void;
}) {
  const statusLabel = !channel.last_run_at
    ? "Not synced yet"
    : channel.last_status === "error"
      ? `Last sync failed: ${channel.last_error ?? "unknown error"}`
      : `Last synced ${new Date(channel.last_run_at).toLocaleString()}`;
  const access = accessLabel(channel);

  return (
    <div
      className="rsd-card"
      data-tour="archive-channel"
      style={{
        flexDirection: "row", alignItems: "center", gap: 14,
        padding: "12px 18px", opacity: channel.active ? 1 : 0.55,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link
          href={`/portal/slack-archive/${encodeURIComponent(channel.slack_channel_id)}`}
          style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)", lineHeight: 1.2, textDecoration: "none" }}
        >
          {channel.label}
        </Link>
        {channel.is_private && (
          <span className="rsd-chip rsd-chip-mute" style={{ marginLeft: 8, fontSize: 11 }}>Private</span>
        )}
        {isAdmin && (
          <>
            <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 2 }}>
              {channel.slack_channel_id} · {statusLabel}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, color: access.warn ? "var(--gw-error)" : "var(--gw-fg-muted)" }}>
              {access.text}
            </div>
          </>
        )}
      </div>
      {isAdmin && (
        <Pill
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => onToggle(channel.id, !channel.active)}
        >
          {channel.active ? "Deactivate" : "Activate"}
        </Pill>
      )}
    </div>
  );
}

function AddChannelForm({
  pending,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  onSubmit: (channelId: string, label: string) => void;
  onCancel: () => void;
}) {
  const [channelId, setChannelId] = useState("");
  const [label, setLabel] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!channelId.trim() || !label.trim()) return;
    onSubmit(channelId.trim(), label.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="rsd-card" style={{ gap: 14, padding: "16px 18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input
          label="Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Coaches"
          autoFocus
          required
        />
        <Input
          label="Slack channel ID"
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          placeholder="e.g. C0123ABC4"
          required
        />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Pill>
        <Pill variant="accent" size="sm" type="submit" disabled={pending || !channelId.trim() || !label.trim()}>
          {pending ? "Adding…" : "Add channel"}
        </Pill>
      </div>
    </form>
  );
}
