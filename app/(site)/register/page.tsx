import type { Metadata } from "next";
import { AuthSection } from "../_components/AuthSection";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Request Access" };

export default function RegisterPage() {
  return (
    <AuthSection title="Request access." intro="New to the member portal? Ask for an account here.">
      <RegisterForm />
    </AuthSection>
  );
}
