// AWS S3 adapter stub. Swap FILM_STORAGE_PROVIDER=s3 once this is filled in;
// the rest of the film uploader talks only to FilmStorageProvider.

import type { FilmStorageProvider, MintedUpload } from "./types.ts";

function notImplemented(): never {
  throw new Error("S3 game-film storage is not implemented yet. Use FILM_STORAGE_PROVIDER=supabase.");
}

export function s3FilmStorage(): FilmStorageProvider {
  return {
    id: "s3",
    mintUpload(): Promise<MintedUpload> {
      return notImplemented();
    },
    signedDownloadUrl(): Promise<string> {
      return notImplemented();
    },
    deleteObject(): Promise<void> {
      return notImplemented();
    },
  };
}
