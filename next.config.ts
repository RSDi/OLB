import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // The maintenance area was renamed to Tasks & Projects; keep old links working.
    return [
      { source: "/portal/maintenance", destination: "/portal/tasks", permanent: false },
      { source: "/portal/maintenance/:path*", destination: "/portal/tasks/:path*", permanent: false },
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
