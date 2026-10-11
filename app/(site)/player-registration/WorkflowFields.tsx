"use client";
import s from "./wizard.module.css";
import { kidFirst, type KidAnswers } from "../../../lib/teams/registration-form";
import { formatPrice, itemsFor, kidExtras, type ExtrasState, type FormExtras, type KidExtras } from "../../../lib/onboarding/form-extras";

// The registration workflow's questions (0130), shared by the wizard and the
// one-page form: each player's uniform sizes, and the handbook signed by
// each player and a parent. Shown only while the workflow is on.

export function setKidExtras(x: ExtrasState, key: string, patch: Partial<KidExtras>): ExtrasState {
  return { ...x, kids: { ...x.kids, [key]: { ...kidExtras(x, key), ...patch } } };
}

export function SizeFields({ kids, config, x, onX }: { kids: KidAnswers[]; config: FormExtras; x: ExtrasState; onX: (next: ExtrasState) => void }) {
  const many = kids.length > 1;
  return (
    <>
      {kids.map((k) => {
        const items = itemsFor(k, config.items);
        if (items.length === 0) return null;
        const mine = kidExtras(x, k.key);
        const pick = (itemId: string, size: string) => onX(setKidExtras(x, k.key, { sizes: { ...mine.sizes, [itemId]: size } }));
        return (
          <div key={k.key} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {many && <span className={s.sectionLabel}>{kidFirst(k)}</span>}
            {items.map((item) => (
              <div key={item.id}>
                <span className={s.sectionLabel}>
                  {item.name}
                  {item.who === "optional" ? " (optional)" : ""}
                  {item.price_cents != null ? ` · ${formatPrice(item.price_cents)}` : ""}
                </span>
                <div className={s.chips} role="group" aria-label={`${kidFirst(k)}'s ${item.name} size`}>
                  {item.who === "optional" && (
                    <button type="button" className={s.chip} aria-pressed={!mine.sizes[item.id]} onClick={() => pick(item.id, "")}>
                      No thanks
                    </button>
                  )}
                  {item.sizes.map((size) => (
                    <button key={size} type="button" className={s.chip} aria-pressed={mine.sizes[item.id] === size} onClick={() => pick(item.id, size)}>
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

export function HandbookFields({ kids, config, x, onX }: { kids: KidAnswers[]; config: FormExtras; x: ExtrasState; onX: (next: ExtrasState) => void }) {
  if (!config.handbookUrl) return null;
  return (
    <>
      <a className={s.secondary} href={config.handbookUrl} target="_blank" rel="noreferrer" style={{ textAlign: "center", textDecoration: "none" }}>
        Open the Player Handbook ↗
      </a>
      {kids.map((k) => (
        <label key={k.key} className={s.field}>
          {kidFirst(k)} signs: type {kids.length > 1 ? "his" : "your player's"} full name
          <input
            className="olb-input"
            autoComplete="off"
            value={kidExtras(x, k.key).handbook_player_name}
            onChange={(e) => onX(setKidExtras(x, k.key, { handbook_player_name: e.target.value }))}
            placeholder={`${k.athlete_first} ${k.athlete_last}`.trim()}
            style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 18 }}
          />
        </label>
      ))}
      <label className={s.field}>
        A parent signs: type your full name
        <input
          className="olb-input"
          autoComplete="off"
          value={x.family.handbook_parent_name}
          onChange={(e) => onX({ ...x, family: { ...x.family, handbook_parent_name: e.target.value } })}
          style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 18 }}
        />
      </label>
      <label className={s.check}>
        <input type="checkbox" checked={x.family.handbook_agreed} onChange={(e) => onX({ ...x, family: { ...x.family, handbook_agreed: e.target.checked } })} />
        We&apos;ve read the handbook together and agree to follow it.
      </label>
    </>
  );
}
