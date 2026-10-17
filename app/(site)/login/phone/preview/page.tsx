import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { AuthSection } from "../../../_components/AuthSection";
import { PhonePairScreen } from "../PhonePairScreen";
import { PairApproveScreen } from "../../../pair/[id]/PairApproveScreen";

export const metadata = { title: "Pairing preview" };

export default async function PairPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.PAIRING_UI_PREVIEW !== "1") notFound();
  const which = (await searchParams).screen;
  const pairUrl = "https://olb.example/pair/3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";
  const qrSvg = await QRCode.toString(pairUrl, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#00000000" },
  });

  if (which === "phone") {
    return (
      <AuthSection title="Approve a device." intro="Check the other screen, pick the matching code, then tap Approve.">
        <PairApproveScreen
          id="3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b"
          name="Jeff Malone"
          device="Chrome on Linux, Tesla"
          city="Omaha"
          ip="198.51.100.24"
          askedAt="Oct 16, 7:12 PM CDT"
          codes={["WDJB-MJHT", "KLVN-XQRP", "BTSG-FHCM"]}
        />
      </AuthSection>
    );
  }

  return (
    <AuthSection title="Sign in with phone." intro="Scan the code with your phone. Don't type a password here.">
      <PhonePairScreen demo={{ userCode: "WDJB-MJHT", pairUrl, qrSvg }} />
    </AuthSection>
  );
}
