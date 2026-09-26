// Slack Channel Archive — photo album: every photo and video shared in the
// registered channels, month by month, searchable. Any approved member can
// open it; row-level security (migration 0084) limits the photos to the
// channels they may see, so a private channel's photos only appear for
// that channel's members. The "make previews" controls are super-admin only.

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
  const viewer = await loadArchiveViewer();
  const [channels, album, params] = await Promise.all([loadArchiveChannels(), loadArchiveAlbum(), searchParams]);
  // Previews are a super-admin chore (it triggers a GitHub workflow); others
  // just see photos without a preview fall back to the original. Only worth
  // a GitHub API call while there's something left to make.
  const showPreviewStatus = viewer.isSuperAdmin && album.missingPreviews > 0;
  const lastPreviewRun = showPreviewStatus ? await loadLatestThumbnailRun() : null;

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
        notice={showPreviewStatus ? <PreviewStatus missing={album.missingPreviews} lastRun={lastPreviewRun} /> : null}
      />
    </div>
  );
}
