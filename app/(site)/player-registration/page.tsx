import type { Metadata } from "next";
import "../../components/olb.css";
import RegistrationFlow from "./RegistrationFlow";

export const metadata: Metadata = { title: "Player Registration" };

// Public 2026-27 player registration: a step-by-step wizard that starts from
// the family's email (and fills in a returning family's details once they've
// typed back the code we email), or the whole form on one page. Submissions
// wait on the Directory's New registrations page
// (/portal/directory/registrations) for someone with the Registrations
// permission to approve.
export default function PlayerRegistrationPage() {
  return (
    <div className="olb-root">
      <RegistrationFlow />
    </div>
  );
}
