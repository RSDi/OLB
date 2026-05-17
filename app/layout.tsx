import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--gw-font-loaded" });

export const metadata: Metadata = {
  title: "Millard Community Church",
  description: "A community of faith in Millard — worship, grow, and serve together.",
  metadataBase: new URL("https://millardcommunitychurch.com"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>{children}</body>
    </html>
  );
}
