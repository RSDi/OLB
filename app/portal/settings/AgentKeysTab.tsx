"use client";
// Settings → Agent keys. Super-admins mint hashed Bearer tokens for
// /api/agent/*. Plaintext is shown once; there is no reveal later.

import { useEffect, useState } from "react";
import { Icons } from "../../components/icons";
import { Input, Pill } from "../../components/ui";
import { copyText } from "../../../lib/copy-text";
import {
  createAgentKey,
  loadAgentKeys,
  revokeAgentKey,
} from "../../../lib/agent/keys-actions";
import type { PublicAgentKey } from "../../../lib/agent/keys";
import { AGENT_SCOPE_LABELS, AGENT_SCOPES, type AgentScope } from "../../../lib/agent/scopes";

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

export function AgentKeysTab() {
  const [keys, setKeys] = useState<PublicAgentKey[]>([]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<AgentScope[]>(["read"]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadAgentKeys().then((res) => {
      if ("error" in res) setError(res.error);
      else setKeys(res.keys);
    });
  }, []);

  async function refresh() {
    const res = await loadAgentKeys();
    if ("error" in res) setError(res.error);
    else setKeys(res.keys);
  }

  async function onCreate() {
    setPending(true);
    setError(null);
    setCopied(false);
    const res = await createAgentKey(name, scopes);
    setPending(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setRevealed(res.key);
    setName("");
    setScopes(["read"]);
    await refresh();
  }

  async function onRevoke(id: string) {
    if (!confirm("Revoke this key? Anything using it will stop working.")) return;
    setPending(true);
    setError(null);
    const res = await revokeAgentKey(id);
    setPending(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    if (revealed) setRevealed(null);
    await refresh();
  }

  async function copy() {
    if (!revealed) return;
    const ok = await copyText(revealed);
    if (!ok) {
      setError("Couldn't copy. Select the key and copy it yourself.");
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5 }}>
        Keys for club agents. Send <code style={{ fontWeight: 700 }}>Authorization: Bearer …</code>.
        We store a hash, never the key itself — copy it when it appears.{" "}
        <strong>Read game film</strong> is GET-only. <strong>Import email archive</strong> can POST
        a thread to{" "}
        <code style={{ fontWeight: 700 }}>/api/agent/email-archive</code>. Responses never include
        team codes, YouTube tokens, or storage paths.
      </div>

      {error && <ErrorBox text={error} />}

      {revealed && (
        <div
          data-tour="agent-keys-reveal"
          style={{
            background: "var(--gw-success-bg, #eef8f0)",
            border: "1px solid rgba(22,163,74,.25)",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div>
            Copy this now. We won&apos;t show it again:{" "}
            <code style={{ fontSize: 14, fontWeight: 800, overflowWrap: "anywhere" }}>{revealed}</code>
          </div>
          <div>
            <Pill size="sm" onClick={() => void copy()}>
              {copied ? <Icons.Check width={13} height={13} /> : <Icons.Link width={13} height={13} />}
              {copied ? "Copied" : "Copy key"}
            </Pill>
          </div>
        </div>
      )}

      <form
        data-tour="agent-keys-create"
        onSubmit={(e) => {
          e.preventDefault();
          void onCreate();
        }}
        className="rsd-card"
        style={{ padding: 18, gap: 12, display: "flex", flexDirection: "column" }}
      >
        <Input
          label="Name"
          help="A label only you see, like Film reader. Not sent with requests."
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Film reader"
          autoComplete="off"
          required
        />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8 }}>
            Permissions
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {AGENT_SCOPES.map((s) => {
              const on = scopes.includes(s);
              return (
                <label key={s} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setScopes((cur) => (on ? cur.filter((x) => x !== s) : [...cur, s]))
                    }
                  />
                  {AGENT_SCOPE_LABELS[s]}
                </label>
              );
            })}
          </div>
        </div>
        <div>
          <Pill type="submit" size="sm" variant="accent" disabled={pending || !name.trim() || scopes.length === 0}>
            Create key
          </Pill>
        </div>
      </form>

      {keys.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          No keys yet. Create one to let an agent list game film or import email.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {keys.map((k) => (
            <div
              key={k.id}
              data-tour="agent-keys-row"
              className="rsd-card"
              style={{
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{k.name}</div>
                <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
                  <code>{k.prefix}…</code>
                  {k.createdAt ? ` · ${new Date(k.createdAt).toLocaleString()}` : ""}
                  {k.scopes?.length ? ` · ${k.scopes.map((s) => AGENT_SCOPE_LABELS[s as AgentScope] ?? s).join(" · ")}` : ""}
                </div>
              </div>
              <Pill size="sm" disabled={pending} onClick={() => void onRevoke(k.id)}>
                Revoke
              </Pill>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
