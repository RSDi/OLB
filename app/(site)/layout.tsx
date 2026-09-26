import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { Footer } from "./_components/Footer";
import { Header } from "./_components/Header";
import styles from "./_components/site.module.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "500", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default: "Omaha Lightning Basketball",
    template: "%s — Omaha Lightning Basketball",
  },
  description:
    "Omaha Lightning Basketball exists to provide home educated boys the opportunity to participate in an organized competitive basketball program that has a distinctly Christian character.",
  openGraph: { siteName: "Omaha Lightning Basketball", type: "website" },
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${poppins.className} ${styles.site}`}>
      <Header />
      <main id="page" className={styles.main}>
        {children}
      </main>
      <Footer />
    </div>
  );
}
