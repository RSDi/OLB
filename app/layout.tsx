import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--gw-font-loaded" });

export const metadata: Metadata = {
  title: "Omaha Lightning Basketball",
  description: "Omaha Lightning Basketball exists to provide home educated boys the opportunity to participate in an organized competitive basketball program that has a distinctly Christian character.",
  metadataBase: new URL("https://omahalightningbasketball.com"),
  // Safari Favorites (and Add to Home Screen) look for /apple-touch-icon.png,
  // not the tab favicon. File-based app/apple-icon.png is still the image;
  // these links name the well-known path Safari actually requests.
  icons: {
    icon: [{ url: "/icon.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [
      {
        rel: "apple-touch-icon-precomposed",
        url: "/apple-touch-icon-precomposed.png",
      },
    ],
  },
  // Opens full screen when added to the iPhone Home Screen or the Mac Dock
  // (the manifest lives in app/manifest.ts).
  appleWebApp: {
    capable: true,
    title: "OLB - Portal",
    statusBarStyle: "default",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>{children}</body>
    </html>
  );
}
