import { createClient } from "../../../../lib/supabase/server";
import RegistrationActions from "../_components/RegistrationActions";
import { ageFromDob } from "../../../../lib/teams/age";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  first_name: string;
  last_name: string;
  dob: string | null;
  parent_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
  extra: Record<string, unknown> | null;
};

export default async function RegistrationsPage() {
  const db = await createClient();
  const { data: board } = await db.from("olb_boards").select("id").eq("season", "2026-2027").maybeSingle();
  const { data } = board
    ? await db.from("olb_registrations").select("*").eq("board_id", board.id).eq("status", "pending").order("created_at")
    : { data: [] as Row[] };
  const regs = (data ?? []) as Row[];

  return (
    <div className="olb-page">
      <h1 className="olb-h1" style={{ marginBottom: 6 }}>Pending registrations</h1>
      <p className="olb-sub" style={{ marginTop: 0, marginBottom: 16 }}>
        Approve to add the player to the Unassigned pool, then drag them onto a team.
      </p>

      {regs.length === 0 ? (
        <div className="olb-card olb-card--pad olb-muted">No pending registrations.</div>
      ) : (
        <div className="olb-card" style={{ overflowX: "auto" }}>
          <table className="olb-tbl">
            <thead>
              <tr>
                <th>Athlete</th>
                <th>Age</th>
                <th>Fee</th>
                <th>Payment</th>
                <th>Parent / contact</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {regs.map((r) => {
                const x = (r.extra ?? {}) as Record<string, unknown>;
                const fee = typeof x.fee_tier === "string" ? x.fee_tier : "—";
                const payment = typeof x.payment_option === "string" ? x.payment_option : "—";
                const tags: string[] = [];
                if (x.first_season === true) tags.push("First season");
                if (x.needs_uniform === true) tags.push("Needs uniform");
                if (x.needs_grays === true) tags.push("Needs grays");
                const age = ageFromDob(r.dob);
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>
                      {r.first_name} {r.last_name}
                      {tags.length > 0 && <div className="olb-sub" style={{ fontSize: 12 }}>{tags.join(" · ")}</div>}
                    </td>
                    <td>{age ?? "—"}</td>
                    <td>{fee}</td>
                    <td>{payment}</td>
                    <td>
                      <div>{r.parent_name ?? "—"}</div>
                      <div className="olb-sub" style={{ fontSize: 12 }}>
                        {[r.parent_email, r.parent_phone].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    <td><RegistrationActions id={r.id} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
