import type { Metadata } from "next";
import { CommitmentsClickThrough } from "./CommitmentsClickThrough";

export const metadata: Metadata = { title: "Registration commitments" };

export default function RegistrationCommitmentsMockupPage() {
  return <CommitmentsClickThrough />;
}
