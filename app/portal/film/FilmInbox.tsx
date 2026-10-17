"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, Pill } from "../../components/ui";
import { Icons } from "../../components/icons";
import {
  deleteFilmUpload,
  markFilmMoved,
  restoreFilmHolding,
  signedFilmDownload,
} from "../../../lib/film/admin-actions";
import type { FilmStatus, FilmUpload } from "../../../lib/film/types";

interface Props {
  uploads: FilmUpload[];
  canManage: boolean;
  loadError: string | null;
  parentLinks: { slug: string; label: string }[];
}

type Filter = "all" | FilmStatus;

function formatBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function FilmInbox({ uploads, canManage, loadError, parentLinks }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const shown = useMemo(
    () => (filter === "all" ? uploads : uploads.filter((u) => u.status === filter)),
    [filter, uploads]
  );

  async function run(id: string, fn: (id: string) => Promise<{ error?: string }>) {
    setBusy(id);
    setError(null);
    const result = await fn(id);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  async function download(id: string) {
    setBusy(id);
    setError(null);
    const result = await signedFilmDownload(id);
    setBusy(null);
    if (result.error || !result.url) {
      setError(result.error ?? "Couldn't make a download link.");
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 960 }}>
      <p style={{ margin: 0, fontSize: 14, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5 }}>
        Videos families upload from their phones. Download a copy, then <strong>Mark moved</strong> once
        it&apos;s on YouTube or a drive. Files marked moved are deleted automatically after 30 days.
      </p>

      {parentLinks.length > 0 && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          Family upload pages:{" "}
          {parentLinks.map((t, i) => (
            <span key={t.slug}>
              {i > 0 && ", "}
              <a href={`/t/${t.slug}`} style={{ fontWeight: 700 }}>
                {t.label}
              </a>
            </span>
          ))}
          . Share the team code, not this page.
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} data-tour="film-filter">
        {(["all", "holding", "moved"] as Filter[]).map((key) => (
          <Pill key={key} size="sm" variant={filter === key ? "dark" : "light"} onClick={() => setFilter(key)}>
            {key === "all" ? "All" : key === "holding" ? "Holding" : "Moved"}
          </Pill>
        ))}
      </div>

      {(loadError || error) && (
        <p style={{ margin: 0, color: "var(--gw-error)", fontWeight: 600, fontSize: 13 }}>{loadError || error}</p>
      )}

      {shown.length === 0 ? (
        <EmptyState
          icon={<Icons.Video width={32} height={32} />}
          title={uploads.length === 0 ? "No film yet" : "Nothing in this view"}
          body={
            uploads.length === 0
              ? "When a family uploads from a team page, it shows up here."
              : "Try All, or the other status."
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {shown.map((row) => (
            <div
              key={row.id}
              data-tour="film-row"
              className="rsd-card"
              style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, wordBreak: "break-word" }}>{row.filename}</div>
                  <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 600, marginTop: 4 }}>
                    {row.team} · {row.uploader_name} · {formatBytes(row.size_bytes)} · {formatWhen(row.created_at)}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    alignSelf: "flex-start",
                    padding: "4px 8px",
                    borderRadius: 100,
                    background: row.status === "moved" ? "var(--gw-success-bg)" : "var(--gw-bg-elev)",
                    color: row.status === "moved" ? "var(--gw-success)" : "var(--gw-fg-muted)",
                  }}
                >
                  {row.status === "moved" ? "Moved" : "Holding"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span data-tour="film-download">
                  <Pill size="sm" onClick={() => download(row.id)} disabled={busy === row.id}>
                    Download
                  </Pill>
                </span>
                {canManage && row.status === "holding" && (
                  <span data-tour="film-moved">
                    <Pill
                      size="sm"
                      variant="accent"
                      onClick={() => run(row.id, markFilmMoved)}
                      disabled={busy === row.id}
                    >
                      Mark moved
                    </Pill>
                  </span>
                )}
                {canManage && row.status === "moved" && (
                  <Pill size="sm" onClick={() => run(row.id, restoreFilmHolding)} disabled={busy === row.id}>
                    Back to holding
                  </Pill>
                )}
                {canManage && (
                  <span data-tour="film-delete">
                    <Pill
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Delete ${row.filename}? This cannot be undone.`)) {
                          void run(row.id, deleteFilmUpload);
                        }
                      }}
                      disabled={busy === row.id}
                    >
                      Delete
                    </Pill>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
