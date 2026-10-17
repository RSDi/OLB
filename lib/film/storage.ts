// Storage behind a provider interface so game film can move off Supabase
// later (R2 / S3 stubs in this folder). FILM_STORAGE_PROVIDER selects it.

import { r2FilmStorage } from "./r2-storage";
import { s3FilmStorage } from "./s3-storage";
import { supabaseFilmStorage } from "./supabase-storage";
import type { FilmStorageProvider } from "./types";

export function filmStorage(env: Record<string, string | undefined> = process.env): FilmStorageProvider {
  const kind = (env.FILM_STORAGE_PROVIDER ?? "supabase").trim().toLowerCase();
  if (kind === "r2") return r2FilmStorage();
  if (kind === "s3") return s3FilmStorage();
  return supabaseFilmStorage();
}
