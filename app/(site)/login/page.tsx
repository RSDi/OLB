import type { Metadata } from "next";
import { AuthSection } from "../_components/AuthSection";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Login" };

// The query is read here rather than with useSearchParams, so the form is in
// the first HTML instead of appearing once the page's scripts load.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { status, error } = await searchParams;
  return (
    <AuthSection title="Member login." intro="Sign in to the member portal.">
      <LoginForm
        status={typeof status === "string" ? status : null}
        urlError={typeof error === "string" ? error : null}
      />
    </AuthSection>
  );
}
