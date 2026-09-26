// Slack Channel Archive — photo album: every photo and video shared in the
// registered channels, month by month, searchable. Super-admin only, same as
// the rest of this feature (re-checked here so a direct link can't bypass
// the gate).

import Link from "next/link";
import { loadArchiveViewer, loadArchiveChannels, loadArchiveAlbum } from "../../../../lib/slack-archive/data";
import { parseAlbumUrlState } from "../../../../lib/slack-archive/album";
import { loadLatestThumbnailRun } from "../../../../lib/slack-archive/thumbnail-actions";
import { AlbumView } from "./AlbumView";
import { PreviewStatus } from "./PreviewStatus";
import { albumFontVariables } from "./fonts";

export default async function SlackArchiveAlbumPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await loadArchiveViewer();
  const [channels, album, params] = await Promise.all([loadArchiveChannels(), loadArchiveAlbum(), searchParams]);
  // Only worth a GitHub API call while there's something left to make.
  const lastPreviewRun = album.missingPreviews > 0 ? await loadLatestThumbnailRun() : null;

  return (
    <div className={albumFontVariables} style={{ maxWidth: 1440 }}>
      <Link
        href="/portal/slack-archive"
        style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", textDecoration: "none" }}
      >
        ← All channels
      </Link>
      {album.queryError && (
        <div
          style={{
            margin: "12px 0 0", padding: "12px 16px", borderRadius: 10,
            background: "var(--gw-error-bg)", border: "1px solid rgba(229,62,62,.25)",
            color: "var(--gw-error)", fontSize: 12.5, fontWeight: 600,
          }}
        >
          Some of the album couldn&rsquo;t load: {album.queryError}. What loaded is shown below — reload to try again.
        </div>
      )}
      <AlbumView
        items={album.items}
        channels={channels.map((c) => ({ id: c.slack_channel_id, label: c.label }))}
        initialState={parseAlbumUrlState(params)}
        signedAt={album.signedAt}
        previewTtlMs={album.previewTtlMs}
        notice={album.missingPreviews > 0 ? <PreviewStatus missing={album.missingPreviews} lastRun={lastPreviewRun} /> : null}
      />
    </div>
  );
}
