// Web app manifest: lets Chrome, Edge and Safari install the member portal as
// an app (served at /manifest.webmanifest and linked from every page).
// ReelNotes keeps its own narrower manifest (public/reelnotes-manifest.webmanifest),
// which its page metadata swaps in, so it can still be installed on its own.

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/portal",
    name: "Omaha Lightning Basketball",
    short_name: "Lightning",
    description: "The Omaha Lightning member portal for families, coaches and the board.",
    start_url: "/portal",
    scope: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#FFFFFF",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
