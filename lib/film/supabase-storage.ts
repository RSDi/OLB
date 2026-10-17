// Supabase Storage provider: mint a short-lived signed upload token with the
// service-role key (never sent to the browser as the key itself). The client
// then TUS-uploads straight to Storage — bytes never pass through Vercel.

import { createAdminClient } from "../supabase/admin.ts";
import { GAME_FILM_BUCKET, TUS_CHUNK_SIZE, type FilmStorageProvider, type MintedUpload } from "./types.ts";

export { TUS_CHUNK_SIZE };

export function tusEndpoint(supabaseUrl: string): string {
  const raw = supabaseUrl.replace(/\/+$/, "");
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/\.supabase\.co$/i, ".storage.supabase.co");
    return `${u.protocol}//${host}/storage/v1/upload/resumable`;
  } catch {
    return `${raw}/storage/v1/upload/resumable`;
  }
}

export function supabaseFilmStorage(): FilmStorageProvider {
  return {
    id: "supabase",
    async mintUpload({ path }): Promise<MintedUpload> {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
      const admin = createAdminClient();
      const { data, error } = await admin.storage
        .from(GAME_FILM_BUCKET)
        .createSignedUploadUrl(path, { upsert: false });
      if (error || !data) {
        throw new Error(error?.message ?? "Couldn't mint an upload token.");
      }
      return {
        bucket: GAME_FILM_BUCKET,
        path: data.path,
        endpoint: tusEndpoint(url),
        token: data.token,
      };
    },
    async signedDownloadUrl(path, expiresInSeconds): Promise<string> {
      const admin = createAdminClient();
      const { data, error } = await admin.storage
        .from(GAME_FILM_BUCKET)
        .createSignedUrl(path, expiresInSeconds);
      if (error || !data?.signedUrl) {
        throw new Error(error?.message ?? "Couldn't make a download link.");
      }
      return data.signedUrl;
    },
    async deleteObject(path): Promise<void> {
      const admin = createAdminClient();
      const { error } = await admin.storage.from(GAME_FILM_BUCKET).remove([path]);
      if (error) throw new Error(error.message);
    },
  };
}
