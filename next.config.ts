import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // The maintenance area was renamed to Tasks & Projects; keep old links working.
    return [
      { source: "/portal/maintenance", destination: "/portal/tasks", permanent: false },
      { source: "/portal/maintenance/:path*", destination: "/portal/tasks/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
