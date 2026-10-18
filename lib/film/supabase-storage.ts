// Supabase Storage provider: mint a short-lived signed upload token with the
// service-role key (never sent to the browser as the key itself), then create
// the TUS upload on Storage from this server. The client PATCHes file bytes
// straight to the returned Location — they never pass through Vercel.

import { createAdminClient } from "../supabase/admin.ts";
import { createSignedTusUpload } from "./tus-create.ts";
import { tusEndpoint } from "./tus.ts";
import { GAME_FILM_BUCKET, TUS_CHUNK_SIZE, type FilmStorageProvider, type MintedUpload } from "./types.ts";

export { TUS_CHUNK_SIZE, tusEndpoint };

export function supabaseFilmStorage(): FilmStorageProvider {
  return {
    id: "supabase",
    async mintUpload({ path, contentType, sizeBytes }): Promise<MintedUpload> {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
      const admin = createAdminClient();
      const { data, error } = await admin.storage
        .from(GAME_FILM_BUCKET)
        .createSignedUploadUrl(path, { upsert: false });
      if (error || !data) {
        throw new Error(error?.message ?? "Couldn't mint an upload token.");
      }
      const endpoint = tusEndpoint(url);
      const uploadUrl = await createSignedTusUpload({
        endpoint,
        token: data.token,
        path: data.path,
        contentType,
        sizeBytes,
      });
      return {
        bucket: GAME_FILM_BUCKET,
        path: data.path,
        endpoint,
        token: data.token,
        uploadUrl,
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
    async objectExists(path): Promise<boolean> {
      const admin = createAdminClient();
      const slash = path.lastIndexOf("/");
      const folder = slash === -1 ? "" : path.slice(0, slash);
      const name = slash === -1 ? path : path.slice(slash + 1);
      const { data, error } = await admin.storage.from(GAME_FILM_BUCKET).list(folder, {
        limit: 20,
        search: name,
      });
      if (error) return false;
      return (data ?? []).some((obj) => obj.name === name);
    },
  };
}
