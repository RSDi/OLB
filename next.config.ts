import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ReelNotes ships as a workspace package of raw TS/TSX source; Next must
  // transpile it like first-party app code.
  transpilePackages: ["reelnotes"],
  async redirects() {
    // The maintenance area was renamed to Tasks & Projects; keep old links working.
    return [
      { source: "/portal/maintenance", destination: "/portal/tasks", permanent: false },
      { source: "/portal/maintenance/:path*", destination: "/portal/tasks/:path*", permanent: false },
      // Dave's Idea was renamed to ReelNotes; keep old links + installed PWAs working.
      { source: "/portal/daves-idea", destination: "/portal/reelnotes", permanent: false },
      { source: "/portal/daves-idea/:path*", destination: "/portal/reelnotes/:path*", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
