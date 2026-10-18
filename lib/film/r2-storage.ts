// Cloudflare R2 adapter stub. Swap FILM_STORAGE_PROVIDER=r2 once this is
// filled in; the rest of the film uploader talks only to FilmStorageProvider.

import type { FilmStorageProvider, MintedUpload } from "./types.ts";

function notImplemented(): never {
  throw new Error("R2 game-film storage is not implemented yet. Use FILM_STORAGE_PROVIDER=supabase.");
}

export function r2FilmStorage(): FilmStorageProvider {
  return {
    id: "r2",
    mintUpload(): Promise<MintedUpload> {
      return notImplemented();
    },
    signedDownloadUrl(): Promise<string> {
      return notImplemented();
    },
    deleteObject(): Promise<void> {
      return notImplemented();
    },
    objectExists(): Promise<boolean> {
      return notImplemented();
    },
  };
}
