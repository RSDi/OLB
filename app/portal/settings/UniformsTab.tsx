"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Input, Pill, Select } from "../../components/ui";
import { ErrorBox } from "./TeamsSettingsTab";
import {
  loadUniformSetup,
  removeUniformItem,
  restoreUniformItem,
  saveUniformItem,
  saveUniformSettings,
  type ItemInput,
} from "../../../lib/onboarding/uniform-actions";
import { DEFAULT_SIZES, WHO_LABEL } from "../../../lib/onboarding/uniforms";
import type { UniformItem } from "../../../lib/onboarding/form-extras";
import type { UniformSettings } from "../../../lib/onboarding/server";

type Item = UniformItem & { sort_order: number; active: boolean };

const sub: React.CSSProperties = { fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5, margin: 0 };

function toInput(i: Item): ItemInput {
  return { id: i.id, name: i.name, who: i.who, price: i.price_cents == null ? "" : String(i.price_cents / 100), sizes: i.sizes.join(", "), sort_order: i.sort_order };
}

// Settings → Uniforms (0130): the uniform items for the season, what each
// costs and the sizes the vendor offers, plus try-on, the order deadline and
// when families are charged. The registration form asks families for these
// sizes while the registration workflow is on, and the Uniforms page counts
// them. The uniforms permission or Registrations.
export function UniformsTab() {
  const [data, setData] = useState<{ settings: UniformSettings; items: Item[] } | null>(null);
  const [general, setGeneral] = useState({ try_on: "", order_deadline: "", charge_when: "order" });
  const [editing, setEditing] = useState<ItemInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadUniformSetup>>) => {
    if ("error" in res) return setError(res.error);
    setData(res);
    setGeneral({ try_on: res.settings.try_on ?? "", order_deadline: res.settings.order_deadline ?? "", charge_when: res.settings.charge_when });
  }, []);
  const load = useCallback(async () => apply(await loadUniformSetup()), [apply]);
  useEffect(() => {
    let cancelled = false;
    loadUniformSetup().then((res) => {
      if (!cancelled) apply(res);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  if (error && !data) return <ErrorBox text={error} />;
  if (!data) return <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>Loading…</div>;

  const act = async (fn: () => Promise<{ error?: string; notice?: string }>, done?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fn();
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return false;
    }
    if (done) setNotice(done);
    await load();
    return true;
  };

  const active = data.items.filter((i) => i.active);
  const removed = data.items.filter((i) => !i.active);
  const nextSort = (active.at(-1)?.sort_order ?? 0) + 10;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 820 }}>
      <p style={{ ...sub, fontSize: 13, maxWidth: 640 }}>
        The uniform items for this season. While the registration workflow is on, families pick a size for each one on the
        registration form, and the <Link href="/portal/directory/uniforms">Uniforms page</Link> counts them for the order.
      </p>
      {error && <ErrorBox text={error} />}
      {notice && (
        <div role="status" style={{ padding: "10px 14px", borderRadius: 10, background: "var(--rsd-accent-bg)", fontSize: 13, fontWeight: 600 }}>
          {notice}
        </div>
      )}

      <div className="rsd-card" style={{ padding: 0, gap: 0, overflow: "hidden" }} data-tour="uniform-items">
        {active.length === 0 && !editing && (
          <div style={{ padding: "24px 18px", ...sub }}>No items yet. Add the jersey and shorts first, then grays and warm-ups.</div>
        )}
        {active.map((i, n) =>
          editing?.id === i.id ? (
            <ItemForm key={i.id} value={editing} onChange={setEditing} busy={busy} onCancel={() => setEditing(null)} onSave={async () => (await act(() => saveUniformItem(editing), "Saved.")) && setEditing(null)} />
          ) : (
            <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderTop: n ? "1px solid var(--gw-border)" : "none", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                  {i.name} <span style={{ fontWeight: 600, color: "var(--gw-fg-muted)" }}>· {i.price_cents == null ? "no price yet" : `$${(i.price_cents / 100).toFixed(i.price_cents % 100 ? 2 : 0)}`}</span>
                </div>
                <div style={sub}>
                  {WHO_LABEL[i.who]} · {i.sizes.join(", ")}
                </div>
              </div>
              <Pill size="sm" variant="ghost" onClick={() => setEditing(toInput(i))} disabled={busy}>
                Edit
              </Pill>
              <Pill size="sm" variant="ghost" onClick={() => act(() => removeUniformItem(i.id), `${i.name} is off the form.`)} disabled={busy}>
                Remove
              </Pill>
            </div>
          )
        )}
        {editing && !editing.id && (
          <ItemForm value={editing} onChange={setEditing} busy={busy} onCancel={() => setEditing(null)} onSave={async () => (await act(() => saveUniformItem(editing), "Added.")) && setEditing(null)} />
        )}
      </div>
      {!editing && (
        <div style={{ display: "flex", gap: 8 }} data-tour="uniform-add">
          <Pill size="sm" variant="accent" onClick={() => setEditing({ name: "", who: "all", price: "", sizes: DEFAULT_SIZES.join(", "), sort_order: nextSort })}>
            + Add item
          </Pill>
        </div>
      )}
      {removed.length > 0 && (
        <div style={sub}>
          Removed:{" "}
          {removed.map((i, n) => (
            <span key={i.id}>
              {n > 0 && ", "}
              {i.name}{" "}
              <button type="button" onClick={() => act(() => restoreUniformItem(i.id), `${i.name} is back.`)} style={{ border: "none", background: "none", padding: 0, fontWeight: 700, textDecoration: "underline", cursor: "pointer", color: "var(--gw-fg)" }}>
                Put back
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="rsd-card" style={{ gap: 14, padding: "16px 18px" }} data-tour="uniform-dates">
        <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>Try-on and the order</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          <Input label="Try-on night" value={general.try_on} onChange={(e) => setGeneral({ ...general, try_on: e.target.value })} placeholder="Mon, Sep 14 at 6pm in the gym" />
          <Input label="Order deadline" type="date" value={general.order_deadline} onChange={(e) => setGeneral({ ...general, order_deadline: e.target.value })} />
          <Select
            label="Charge families"
            help="When the uniform charges go on families' Payments accounts."
            value={general.charge_when}
            onChange={(e) => setGeneral({ ...general, charge_when: e.target.value })}
          >
            <option value="order">When I mark the order placed</option>
            <option value="registration">When their registration is approved</option>
          </Select>
        </div>
        <div>
          <Pill size="sm" variant="accent" onClick={() => act(() => saveUniformSettings(general), "Saved.")} disabled={busy}>
            Save
          </Pill>
        </div>
      </div>
    </div>
  );
}

function ItemForm({ value, onChange, onSave, onCancel, busy }: { value: ItemInput; onChange: (v: ItemInput) => void; onSave: () => void; onCancel: () => void; busy: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 18px", borderTop: "1px solid var(--gw-border)", background: "var(--gw-bg)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <Input label="Item" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Home/away jersey" />
        <Select label="Who gets it" value={value.who} onChange={(e) => onChange({ ...value, who: e.target.value })}>
          <option value="all">{WHO_LABEL.all}</option>
          <option value="hs">{WHO_LABEL.hs}</option>
          <option value="optional">{WHO_LABEL.optional}</option>
        </Select>
        <Input label="Price" inputMode="decimal" value={value.price} onChange={(e) => onChange({ ...value, price: e.target.value })} placeholder="Blank until you know" />
      </div>
      <Input label="Sizes" help="Separated by commas, in the order families should see them." value={value.sizes} onChange={(e) => onChange({ ...value, sizes: e.target.value })} />
      <div style={{ display: "flex", gap: 8 }}>
        <Pill size="sm" variant="accent" onClick={onSave} disabled={busy}>
          {busy ? "Saving…" : "Save item"}
        </Pill>
        <Pill size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Pill>
      </div>
    </div>
  );
}
