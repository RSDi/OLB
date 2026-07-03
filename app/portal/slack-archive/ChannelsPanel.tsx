"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "../../components/icons";
import { Input, Pill } from "../../components/ui";
import { addArchiveChannel, setArchiveChannelActive } from "../../../lib/slack-archive/channel-actions";
import type { ArchiveChannel } from "../../../lib/slack-archive/data";

export function ChannelsPanel({ channels }: { channels: ArchiveChannel[] }) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  function handleToggle(id: string, active: boolean) {
    startTransition(async () => {
      const result = await setArchiveChannelActive(id, active);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 520 }}>
          Registered channels sync nightly. Add a channel by its Slack ID (in Slack:
          open the channel → View channel details → ID at the bottom) — no other
          Slack setup needed to register one.
        </div>
        {!adding && (
          <Pill variant="accent" size="sm" onClick={() => setAdding(true)}>
            <Icons.Plus width={14} height={14} /> Add channel
          </Pill>
        )}
      </div>

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
            No channels registered yet.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {channels.map((c) => (
            <ChannelRow key={c.id} channel={c} pending={pending} onToggle={handleToggle} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelRow({
  channel,
  pending,
  onToggle,
}: {
  channel: ArchiveChannel;
  pending: boolean;
  onToggle: (id: string, active: boolean) => void;
}) {
  const statusLabel = !channel.last_run_at
    ? "Not synced yet"
    : channel.last_status === "error"
      ? `Last sync failed: ${channel.last_error ?? "unknown error"}`
      : `Last synced ${new Date(channel.last_run_at).toLocaleString()}`;

  return (
    <div
      className="rsd-card"
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
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 2 }}>
          {channel.slack_channel_id} · {statusLabel}
        </div>
      </div>
      <Pill
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => onToggle(channel.id, !channel.active)}
      >
        {channel.active ? "Deactivate" : "Activate"}
      </Pill>
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
          placeholder="e.g. Building Committee"
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
