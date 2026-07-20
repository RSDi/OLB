import type { Metadata } from "next";
import QRCode from "qrcode";
import { siteUrl } from "../../../lib/closures/data";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = {
  title: "Door Sign — We're Not Meeting Today",
  description: "Printable one-page door sign with a QR code to /not-here.",
};

// The sign is printed once and taped up for years, so the QR must encode the
// canonical production URL — warn loudly if we'd bake in a fallback origin.
export default async function NotHereSignPage() {
  const url = `${siteUrl()}/not-here`;
  const displayUrl = url.replace(/^https?:\/\//, "");
  const qrSvg = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
  const originWarning =
    process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_SITE_URL;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#fff",
      color: "#000",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    }}>
      {/* Sign body — black on white so it photocopies cleanly. */}
      <style>{`
        @page { size: letter portrait; margin: 0.75in; }
        @media print {
          .no-print { display: none !important; }
          .sign-page { min-height: auto !important; padding: 0 !important; }
        }
      `}</style>

      <div className="sign-page" style={{
        width: "100%",
        maxWidth: 700,
        padding: "48px 32px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 36,
      }}>
        <div style={{
          fontSize: 16,
          fontWeight: 800,
          letterSpacing: ".14em",
          textTransform: "uppercase",
        }}>
          Millard Community Church
        </div>

        <h1 style={{
          margin: 0,
          fontSize: 58,
          fontWeight: 800,
          lineHeight: 1.08,
          letterSpacing: "-.02em",
        }}>
          We&rsquo;re not meeting today.
        </h1>

        <p style={{
          margin: 0,
          fontSize: 24,
          lineHeight: 1.5,
          fontWeight: 500,
        }}>
          We apologize for the inconvenience.
          <br />
          Scan this QR code for more information.
        </p>

        <div
          style={{ width: 336, height: 336 }}
          // Server-generated SVG from the qrcode package — trusted content.
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />

        <div style={{ fontSize: 16, fontWeight: 600 }}>
          Or visit: {displayUrl}
        </div>

        {originWarning && (
          <div className="no-print" style={{
            padding: "12px 20px",
            border: "2px solid #b00",
            borderRadius: 10,
            color: "#b00",
            fontSize: 14,
            fontWeight: 700,
            maxWidth: 480,
          }}>
            NEXT_PUBLIC_SITE_URL is not set — this QR code points at {url}, which
            may not be the church&rsquo;s permanent address. Set it before printing
            the real sign.
          </div>
        )}

        <PrintButton />
      </div>
    </div>
  );
}
