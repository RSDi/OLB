import { createClient } from "../supabase/client";
import { SITE_IMAGES_BUCKET, SITE_IMAGE_MAX_BYTES, SITE_IMAGE_TYPES } from "./content";

// Client-side uploader for pictures on the public site (Settings → Website).
// The storage policy (migration 0120) lets only the Website grant write to
// the bucket. Files are keyed flat by <uuid>.<ext> and never overwritten, so
// a page cached with the old picture keeps working until it refreshes.

export interface SiteImageUpload {
  url?: string;
  width?: number;
  height?: number;
  error?: string;
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

// The picture's size in pixels, read in the browser before it's uploaded.
function measure(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export async function uploadSiteImage(file: File): Promise<SiteImageUpload> {
  if (!SITE_IMAGE_TYPES.includes(file.type)) {
    return { error: "Choose a JPEG, PNG, WebP or GIF picture. (iPhone HEIC photos: share or export them as JPEG first.)" };
  }
  if (file.size > SITE_IMAGE_MAX_BYTES) {
    return { error: "That picture is over 10 MB. Choose a smaller one." };
  }
  const size = await measure(file);
  if (!size) return { error: "Couldn't open that picture. Try a different file." };

  const supabase = createClient();
  const path = `${crypto.randomUUID()}.${EXT[file.type]}`;
  const { error } = await supabase.storage
    .from(SITE_IMAGES_BUCKET)
    .upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
  if (error) return { error: error.message };

  const { data } = supabase.storage.from(SITE_IMAGES_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) return { error: "Upload succeeded but no public URL was returned." };
  return { url: data.publicUrl, ...size };
}
