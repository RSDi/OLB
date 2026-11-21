import type { Metadata } from "next";
import { portalFontVariables } from "../portal/fonts";

export const metadata: Metadata = {
  title: { absolute: "Game film — Omaha Lightning Basketball" },
  robots: { index: false, follow: false },
};

export default function WatchLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-theme="lightning"
      className={portalFontVariables}
      style={{ minHeight: "100vh", background: "var(--gw-bg)", color: "var(--gw-fg)" }}
    >
      {children}
    </div>
  );
}
