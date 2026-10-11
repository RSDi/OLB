import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../../components/olb.css";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { openPrograms } from "../../../../lib/finances/club-data";
import SignupForm from "./SignupForm";

export const metadata: Metadata = { title: "Sign Up" };
// Checked on every visit, so the page opens and closes with the program.
export const dynamic = "force-dynamic";

// A clinic or workout's public sign-up (0131), replacing the Cognito form.
// Open only while club finances is on and the Treasurer has opened the
// program on Payments → Programs; otherwise there's no page here.
export default async function ProgramSignupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let program = null;
  try {
    program = (await openPrograms(createAdminClient())).find((p) => p.id === id) ?? null;
  } catch (e) {
    console.error("[sign-up] loading the program failed", e);
  }
  if (!program) notFound();
  const full = !!program.capacity && program.taken >= program.capacity;
  return (
    <div className="olb-root">
      <SignupForm
        program={{
          id: program.id,
          name: program.name,
          schedule: program.schedule,
          location: program.location,
          description: program.description,
          starts_on: program.starts_on,
          ends_on: program.ends_on,
          levels: program.levels,
        }}
        full={full}
      />
    </div>
  );
}
