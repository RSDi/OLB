import type { Metadata } from "next";
import QRCode from "qrcode";
import { PrintButton } from "../door-sign/PrintButton";

export const metadata: Metadata = {
  title: "Door Sign — Lake Baptism Day",
  description: "Printable one-page door sign for the annual lake baptism & fellowship day.",
};

const SITE_URL = "https://millardcommunitychurch.com";

// Standalone sign for the once-a-year lake day — unlike /door-sign, this
// isn't driven by the Closures system: fixed copy, and the QR points at the
// church's main site rather than /meeting-times.
export default async function DoorSignTempPage() {
  const qrSvg = await QRCode.toString(SITE_URL, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });

  return (
    <div style={{
      minHeight: "100vh",
      background: "#fff",
      color: "#000",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    }}>
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
        gap: 32,
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
          fontSize: 52,
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: "-.02em",
        }}>
          We&rsquo;re not meeting here today.
        </h1>

        <p style={{
          margin: 0,
          fontSize: 22,
          lineHeight: 1.5,
          fontWeight: 500,
        }}>
          Once a year we meet at a lake for baptisms and fellowship.
        </p>

        <div
          style={{ width: 320, height: 320 }}
          // Server-generated SVG from the qrcode package — trusted content.
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />

        <div style={{ fontSize: 16, fontWeight: 600 }}>
          Or visit: millardcommunitychurch.com
        </div>

        <div style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.6 }}>
          Questions? Contact Jeff Malone
          <br />
          <a href="mailto:jeff@malone.net" style={{ color: "inherit" }}>jeff@malone.net</a>
          {" · "}
          <a href="tel:+14026600403" style={{ color: "inherit" }}>(402) 660-0403</a>
        </div>

        <PrintButton />
      </div>
    </div>
  );
}
