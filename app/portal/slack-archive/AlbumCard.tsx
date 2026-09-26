// Entry point to the photo album from the channel list: a small 2×2 "cover"
// of the newest photos beside the album's title. The cover streams in behind
// a Suspense boundary so the channel list never waits on Storage signing.

import { Suspense } from "react";
import Link from "next/link";
import { loadAlbumPreviewTiles, type AlbumPreviewTile } from "../../../lib/slack-archive/data";
import { albumFontVariables } from "./album/fonts";

const COVER_TILES = 4;

export function AlbumCard() {
  return (
    <Link href="/portal/slack-archive/album" className={`rsd-card rsd-album-card ${albumFontVariables}`}>
      <Suspense fallback={<AlbumCover tiles={[]} />}>
        <LoadedAlbumCover />
      </Suspense>
      <div className="rsd-album-card-text">
        <div className="rsd-album-card-title">Photo Album</div>
        <p>Every photo and video shared in these channels, arranged by month and searchable.</p>
        <span className="rsd-album-card-cta">Open the album</span>
      </div>
    </Link>
  );
}

async function LoadedAlbumCover() {
  const tiles = await loadAlbumPreviewTiles(COVER_TILES);
  return <AlbumCover tiles={tiles} />;
}

function AlbumCover({ tiles }: { tiles: AlbumPreviewTile[] }) {
  return (
    <div className="rsd-album-card-cover" aria-hidden="true">
      {Array.from({ length: COVER_TILES }, (_, i) => {
        const tile = tiles[i];
        return (
          <span key={tile?.id ?? `empty-${i}`} className="rsd-album-card-cell">
            {tile && (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL, not a static asset
              <img src={tile.url} alt="" />
            )}
          </span>
        );
      })}
    </div>
  );
}
