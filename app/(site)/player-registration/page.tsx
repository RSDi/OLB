import type { Metadata } from "next";
import "../../components/olb.css";
import RegistrationForm from "./RegistrationForm";

export const metadata: Metadata = { title: "Player Registration" };

// Public 2026-27 player registration. Submissions land in the team manager's
// pending queue (/portal/teams/registrations) for a super-admin to approve.
export default function PlayerRegistrationPage() {
  return (
    <div className="olb-root">
      <RegistrationForm />
    </div>
  );
}
