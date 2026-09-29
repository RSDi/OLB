"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Pill, Select, Textarea } from "../../components/ui";
import { addCharges } from "../../../lib/finances/actions";
import { categoryLabel, formatAmount, parseAmount, type Account } from "../../../lib/finances/logic";
import {
  CHARGE_CATEGORIES,
  CREDIT_CATEGORIES,
  DESCRIPTION_MAX,
  NOTE_MAX,
  type ChargeKind,
} from "../../../lib/finances/types";
import { ErrorNote, Sheet, capStyle, today } from "./parts";

// Something a family owes (a uniform, a tournament) or something taken off
// (covered by the club after a board vote, a scholarship), on one or more of
// their kids. Each kid picked gets the full amount.
export function ChargeDialog({
  account,
  kind,
  onClose,
}: {
  account: Account;
  kind: ChargeKind;
  onClose: () => void;
}) {
  const router = useRouter();
  const categories = kind === "credit" ? CREDIT_CATEGORIES : CHARGE_CATEGORIES;
  const [category, setCategory] = useState<string>(kind === "credit" ? "covered" : "uniform");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(today());
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<Set<string>>(
    new Set(account.players.length === 1 ? [account.players[0].id] : [])
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = parseAmount(amount);
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function save() {
    setError(null);
    setBusy(true);
    const res = await addCharges({
      player_ids: account.players.filter((p) => picked.has(p.id)).map((p) => p.id),
      kind,
      category,
      description,
      amount,
      entry_date: entryDate,
      note,
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    router.refresh();
    onClose();
  }

  const title = kind === "credit" ? "Take off an amount" : "Add a charge";
  const total = cents != null && picked.size > 0 ? cents * picked.size : null;

  return (
    <Sheet eyebrow={`${account.name} family`} title={title} busy={busy} onClose={onClose}>
      {kind === "credit" && (
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>
          For a player the club is covering after a board vote, a scholarship, or fixing a mistake. It comes off what
          the family owes.
        </div>
      )}

      <Select label="What it's for" value={category} onChange={(e) => setCategory(e.target.value)}>
        {categories.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </Select>
      <Input
        label="Description"
        value={description}
        maxLength={DESCRIPTION_MAX}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={categoryLabel(kind, category)}
        help="What the family sees on their balance. Leave it blank to use the category."
      />
      <Input
        label={account.players.length > 1 ? "Amount for each kid" : "Amount"}
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={kind === "credit" ? "375.00" : "110.00"}
      />
      <Input label="Date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={capStyle}>{account.players.length > 1 ? "Which kids" : "Player"}</span>
        {account.players.map((p) => (
          <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
            {p.full_name}
          </label>
        ))}
        {total != null && picked.size > 1 && (
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)" }}>
            {formatAmount(cents!)} each · {formatAmount(total)} in all
          </span>
        )}
      </div>

      <Textarea
        label="Note"
        help={kind === "credit" ? "For example the date of the board vote. The family can see this note." : "The family can see this note."}
        value={note}
        maxLength={NOTE_MAX}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Optional"
      />

      {error && <ErrorNote text={error} />}

      <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 8 }}>
        <Pill variant="accent" onClick={save} disabled={busy}>
          {busy ? "Saving…" : kind === "credit" ? "Take it off" : "Add charge"}
        </Pill>
        <Pill variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Pill>
      </div>
    </Sheet>
  );
}
