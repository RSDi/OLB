// Slack Channel Archive — all exceptions across every channel, in one
// place. Per-channel pages keep their own failed-attachments panel too
// (this doesn't replace that); this is the cross-channel view so nobody has
// to click into each channel to find what needs attention.

import Link from "next/link";
import { CHURCH_TZ } from "../../../../lib/dates/today";
import { loadArchiveAdmin, loadArchiveChannels, loadAllFailedFiles } from "../../../../lib/slack-archive/data";
import { loadLatestCompressionRun } from "../../../../lib/slack-archive/compress-actions";
import { decodeSlackEntities } from "../../../../lib/slack-archive/text";
import { CompressTriggerButton } from "./CompressTriggerButton";
import { ScrollToTopButton } from "../_shared/ScrollToTopButton";

export default async function SlackArchiveExceptionsPage() {
  await loadArchiveAdmin(); // managing the archive, not reading it — super admins only
  const [channels, lastCompressionRun] = await Promise.all([loadArchiveChannels(), loadLatestCompressionRun()]);
  const { entries: failedFiles, totalScanned, deletedInSlack, queryError } = await loadAllFailedFiles(channels);
  const erroredChannels = channels.filter((c) => c.last_status === "error");
  const oversizedMediaCount = failedFiles.filter(
    (f) => (f.file.mimetype ?? "").match(/^(video|audio)\//) && f.file.size > 50 * 1024 * 1024,
  ).length;
  const deletedNote =
    deletedInSlack === 0
      ? ""
      : deletedInSlack === 1
        ? " 1 attachment deleted in Slack before it could be archived isn’t listed."
        : ` ${deletedInSlack} attachments deleted in Slack before they could be archived aren’t listed.`;

  return (
    <div style={{ maxWidth: 760 }}>
      <Link
        href="/portal/slack-archive"
        style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", textDecoration: "none" }}
      >
        ← All channels
      </Link>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--gw-fg)", margin: "4px 0 24px" }}>
        Sync Exceptions
      </h1>

      <Section title={`Channels with sync errors (${erroredChannels.length})`}>
        {erroredChannels.length === 0 ? (
          <EmptyNote>No channel sync errors.</EmptyNote>
        ) : (
          erroredChannels.map((c) => (
            <div key={c.id} className="rsd-card" style={{ padding: "12px 18px" }}>
              <Link
                href={`/portal/slack-archive/${encodeURIComponent(c.slack_channel_id)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontWeight: 700, color: "var(--gw-fg)", textDecoration: "none" }}
              >
                {c.label} ↗
              </Link>
              <div style={{ fontSize: 12.5, color: "var(--gw-error)", marginTop: 4 }}>{c.last_error}</div>
              {c.last_run_at && (
                <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", marginTop: 2 }}>
                  Last attempted {new Date(c.last_run_at).toLocaleString(undefined, { timeZone: CHURCH_TZ })}
                </div>
              )}
            </div>
          ))
        )}
      </Section>

      {oversizedMediaCount > 0 && (
        <div
          className="rsd-card"
          style={{ padding: "14px 18px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--gw-fg)" }}>
              {oversizedMediaCount} video/audio attachment{oversizedMediaCount === 1 ? "" : "s"} over 50MB
            </div>
            <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", marginTop: 2 }}>
              These failed because they&rsquo;re too large to store as-is. Compressing runs on GitHub Actions
              (nightly at 05:40 UTC, or on demand below) — not here, since it needs ffmpeg and more time than
              this site&rsquo;s functions get.
            </div>
          </div>
          <CompressTriggerButton lastRun={lastCompressionRun} />
        </div>
      )}

      <Section
        title={`Attachments needing attention (${failedFiles.length})`}
        subtitle={queryError ? undefined : `Scanned ${totalScanned.toLocaleString()} messages across all channels.${deletedNote}`}
      >
        {queryError && (
          <div className="rsd-card" style={{ padding: "12px 18px", borderColor: "rgba(229,62,62,.25)", color: "var(--gw-error)", fontSize: 12.5, fontWeight: 600 }}>
            Scan failed: {queryError}
          </div>
        )}
        {failedFiles.length === 0 ? (
          <EmptyNote>No attachment errors.</EmptyNote>
        ) : (
          failedFiles.map((f) => {
            const time = new Date(f.postedAt).toLocaleString(undefined, {
              year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: CHURCH_TZ,
            });
            const jumpHref = `/portal/slack-archive/${encodeURIComponent(f.channelId)}#msg-${f.messageTs}`;
            return (
              <div key={`${f.messageId}-${f.file.id}`} className="rsd-card" style={{ padding: "12px 18px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".02em" }}>
                  {f.channelLabel}
                </div>
                <Link
                  href={jumpHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: "none", color: "inherit", display: "block", marginTop: 4 }}
                >
                  <div style={{ fontWeight: 700, color: "var(--gw-fg)" }}>
                    {f.authorName ?? "Unknown"} <span style={{ fontWeight: 500, color: "var(--gw-fg-muted)" }}>· {time}</span>
                  </div>
                  {f.messageText && (
                    <div style={{ color: "var(--gw-fg-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {decodeSlackEntities(f.messageText)}
                    </div>
                  )}
                </Link>
                <div style={{ color: "var(--gw-error)", marginTop: 6, fontWeight: 600, fontSize: 12.5 }}>
                  {f.file.name || "(unnamed attachment)"} — {f.file.error}
                </div>
                <div style={{ marginTop: 2, fontSize: 12.5 }}>
                  <Link href={jumpHref} target="_blank" rel="noopener noreferrer" style={{ color: "var(--rsd-accent)" }}>
                    Jump to message ↗
                  </Link>
                  {f.file.permalink && (
                    <>
                      {" · "}
                      <a href={f.file.permalink} target="_blank" rel="noopener noreferrer" style={{ color: "var(--rsd-accent)" }}>
                        Open in Slack
                      </a>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </Section>
      <ScrollToTopButton />
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--gw-fg)" }}>{title}</div>
      {subtitle && (
        <div style={{ fontSize: 11.5, color: "var(--gw-fg-muted)", marginTop: 2, marginBottom: 8 }}>{subtitle}</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: subtitle ? 0 : 10 }}>{children}</div>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rsd-card" style={{ textAlign: "center", padding: "24px", fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
      {children}
    </div>
  );
}
