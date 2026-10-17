import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Upload game film — Omaha Lightning Basketball" },
  robots: { index: false, follow: false },
};

export default function TeamFilmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="lightning" style={{ minHeight: "100vh", background: "var(--gw-bg)", color: "var(--gw-fg)" }}>
      {children}
    </div>
  );
}
