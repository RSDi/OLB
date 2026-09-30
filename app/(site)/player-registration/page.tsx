import type { Metadata } from "next";
import "../../components/olb.css";
import RegistrationForm from "./RegistrationForm";

export const metadata: Metadata = { title: "Player Registration" };

// Public 2026-27 player registration. Submissions wait on the Directory's New
// registrations page (/portal/directory/registrations) for someone with the
// Registrations permission to approve.
export default function PlayerRegistrationPage() {
  return (
    <div className="olb-root">
      <RegistrationForm />
    </div>
  );
}
