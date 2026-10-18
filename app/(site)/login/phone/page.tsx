import type { Metadata } from "next";
import { AuthSection } from "../../_components/AuthSection";
import { PhonePairScreen } from "./PhonePairScreen";

export const metadata: Metadata = { title: "Sign in with phone" };

export default function PhonePairPage() {
  return (
    <AuthSection
      title="Sign in with phone."
      intro="Scan the code with your phone. Don't type a password here."
    >
      <PhonePairScreen />
    </AuthSection>
  );
}
