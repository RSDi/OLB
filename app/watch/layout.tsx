import type { Metadata } from "next";
import { portalFontVariables } from "../portal/fonts";
import { WebsiteBeacon } from "../(site)/_components/WebsiteBeacon";

export const metadata: Metadata = {
  title: { absolute: "Game film — Omaha Lightning Basketball" },
  robots: { index: false, follow: false },
};

// Team film pages count in Settings → Website Activity, one row per team.
export default function WatchLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-theme="lightning"
      className={portalFontVariables}
      style={{ minHeight: "100vh", background: "var(--gw-bg)", color: "var(--gw-fg)" }}
    >
      {children}
      <WebsiteBeacon />
    </div>
  );
}
