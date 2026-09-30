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
      // The door-QR landing page launched as /not-here before becoming the
      // evergreen Meeting Times page; keep anything already printed working.
      { source: "/not-here", destination: "/meeting-times", permanent: false },
      // The Teams section folded into the Directory.
      { source: "/portal/teams/registrations", destination: "/portal/directory/registrations", permanent: false },
      { source: "/portal/teams", destination: "/portal/directory", permanent: false },
      { source: "/portal/teams/:path*", destination: "/portal/directory", permanent: false },
      // The temporary public search moved behind the login.
      { source: "/search", destination: "/portal/search", permanent: false },
      { source: "/not-here-sign", destination: "/door-sign", permanent: false },
      // URLs from the club's old Squarespace site, so existing links still land.
      { source: "/sponsors-1", destination: "/sponsors", permanent: true },
      { source: "/new-folder", destination: "/philosophy", permanent: false },
      { source: "/new-dropdown", destination: "/summer", permanent: false },
      {
        source: "/resources",
        destination: "https://drive.google.com/file/d/124S_qN47dtCvRyezXGfx8EcA-7C5W2Ke/view?usp=sharing",
        permanent: false,
      },
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
