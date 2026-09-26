import type { Metadata } from "next";
import { AuthSection } from "../_components/AuthSection";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = { title: "Set a New Password" };

export default function ResetPasswordPage() {
  return (
    <AuthSection title="Set a new password." intro="Choose a new password for your account.">
      <ResetPasswordForm />
    </AuthSection>
  );
}
