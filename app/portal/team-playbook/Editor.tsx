"use client";
// Fix a play: the play's details, its steps and captions, and the drawing.
// Drag a numbered ring to move where a player starts (first step), or a small
// ring to change where a player moves to. Saved with Save; Cancel drops it.

import { useMemo, useState } from "react";
import { type MoveKind, type PlayAbout, type PlayAction, type PlayDiagram, type Pt } from "../../../lib/team-playbook/diagram";
import { prepare, stepOverview } from "../../../lib/team-playbook/engine";
import { CATEGORIES, type PlayEdit, type PlaybookTeam, type TeamPlay } from "../../../lib/team-playbook/types";
import { Court, type Handle } from "./Court";
import styles from "./playbook.module.css";

const KINDS: { value: PlayAction["type"]; label: string }[] = [
  { value: "cut", label: "Cut" },
  { value: "dribble", label: "Dribble" },
  { value: "screen", label: "Screen" },
  { value: "pass", label: "Pass" },
];

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function Editor({
  play,
  teams,
  saving,
  error,
  onSave,
  onCancel,
  onDelete,
}: {
  play: TeamPlay;
  teams: PlaybookTeam[];
  saving: boolean;
  error: string | null;
  onSave: (edit: PlayEdit) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [edit, setEdit] = useState<PlayEdit>(() => ({
    name: play.name,
    call_name: play.call_name,
    category: play.category,
    team_ids: play.team_ids,
    coach_name: play.coach_name,
    video_link: play.video_link,
    diagram: clone(play.diagram as PlayDiagram),
  }));
  const [stepIdx, setStepIdx] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Typed as-is so blank lines can be added; the play keeps the trimmed list.
  const [keysText, setKeysText] = useState(() => (play.diagram?.about?.keys ?? []).join("\n"));
  const d = edit.diagram;
  const step = d.steps[Math.min(stepIdx, d.steps.length - 1)];
  const k = Math.min(stepIdx, d.steps.length - 1);

  // Every player and pass picker only offers the play's own players, so the
  // draft can be drawn as it stands. Save cleans it up (normalizeDiagram).
  const prepared = useMemo(() => prepare(d), [d]);
  const frame = stepOverview(prepared, k);

  const change = (fn: (draft: PlayDiagram) => void) =>
    setEdit((e) => {
      const next = clone(e.diagram);
      fn(next);
      return { ...e, diagram: next };
    });

  const setAbout = (patch: Partial<PlayAbout>) =>
    change((draft) => {
      draft.about = { ...(draft.about ?? { why: "", when: "", keys: [] }), ...patch };
    });

  const handles: Handle[] = [];
  if (k === 0) for (const p of d.players) handles.push({ key: `p:${p.id}`, x: p.x, y: p.y, label: p.id });
  step.actions.forEach((a, ai) => {
    if (a.type === "pass") return;
    a.path.forEach((pt, pi) => handles.push({ key: `a:${ai}:${pi}`, x: pt.x, y: pt.y }));
  });

  const onDrag = (key: string, p: Pt) =>
    change((draft) => {
      const [kind, a, b] = key.split(":");
      if (kind === "p") {
        const pl = draft.players.find((x) => x.id === a);
        if (pl) Object.assign(pl, p);
      } else {
        const act = draft.steps[k].actions[Number(a)];
        if (act && act.type !== "pass") act.path[Number(b)] = p;
      }
    });

  const ids = d.players.map((p) => p.id);
  const startPos = prepared.starts[k].pos;
  const holder = prepared.starts[k].holder;

  const addMove = () =>
    change((draft) => {
      const moving = new Set(draft.steps[k].actions.flatMap((a) => (a.type === "pass" ? [] : [a.player])));
      const who = ids.find((id) => !moving.has(id));
      if (!who) return;
      const from = startPos[who];
      draft.steps[k].actions.push({ type: "cut", player: who, path: [{ x: from.x, y: Math.max(-30, from.y - 60) }] });
    });

  const addPass = () =>
    change((draft) => {
      const to = ids.find((id) => id !== holder);
      if (to) draft.steps[k].actions.push({ type: "pass", from: holder, to, s: 0.5 });
    });

  const setAction = (ai: number, a: PlayAction) => change((draft) => void (draft.steps[k].actions[ai] = a));

  const actionRow = (a: PlayAction, ai: number) => {
    const setType = (t: PlayAction["type"]) => {
      if (t === "pass") setAction(ai, { type: "pass", from: holder, to: ids.find((id) => id !== holder) ?? ids[0], s: a.s, e: a.e });
      else if (a.type === "pass") {
        const from = startPos[a.from];
        setAction(ai, { type: t, player: a.from, path: [{ x: from.x, y: Math.max(-30, from.y - 60) }], s: a.s, e: a.e });
      } else setAction(ai, { ...a, type: t as MoveKind });
    };
    return (
      <div key={ai} className={styles.actionRow}>
        <select aria-label="What happens" value={a.type} onChange={(e) => setType(e.target.value as PlayAction["type"])}>
          {KINDS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {a.type === "pass" ? (
          <>
            <select aria-label="From" value={a.from} onChange={(e) => setAction(ai, { ...a, from: e.target.value })}>
              {ids.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            to
            <select aria-label="To" value={a.to} onChange={(e) => setAction(ai, { ...a, to: e.target.value })}>
              {ids.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <select aria-label="Player" value={a.player} onChange={(e) => setAction(ai, { ...a, player: e.target.value })}>
              {ids.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.btn}
              onClick={() =>
                setAction(ai, {
                  ...a,
                  path:
                    a.path.length === 1
                      ? [
                          {
                            x: Math.round((startPos[a.player].x + a.path[0].x) / 2 + 30),
                            y: Math.round((startPos[a.player].y + a.path[0].y) / 2),
                          },
                          a.path[0],
                        ]
                      : [a.path[a.path.length - 1]],
                })
              }
            >
              {a.path.length === 1 ? "Bend it" : "Straighten"}
            </button>
          </>
        )}
        <button type="button" className={styles.iconBtn} aria-label="Remove" onClick={() => change((draft) => void draft.steps[k].actions.splice(ai, 1))}>
          ×
        </button>
      </div>
    );
  };

  const timed = d.steps.some((s) => s.startSec != null);

  return (
    <div className={styles.form}>
      <h2 className={styles.formTitle}>Fix this play</h2>
      <div className={styles.fields}>
        <label className={styles.field}>
          Play name
          <input id="tp-ed-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
        </label>
        <label className={styles.field}>
          Play call
          <input id="tp-ed-call" value={edit.call_name} onChange={(e) => setEdit({ ...edit, call_name: e.target.value })} />
        </label>
        <label className={styles.field}>
          Kind of play
          <select id="tp-ed-cat" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
            <option value="">Other</option>
            {[...new Set([...CATEGORIES, ...(edit.category ? [edit.category] : [])])].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Coach
          <input id="tp-ed-coach" value={edit.coach_name} onChange={(e) => setEdit({ ...edit, coach_name: e.target.value })} />
        </label>
        <label className={styles.field}>
          Link to the original
          <input id="tp-ed-link" value={edit.video_link} placeholder="https://…" onChange={(e) => setEdit({ ...edit, video_link: e.target.value })} />
        </label>
      </div>
      {teams.length > 0 && (
        <div className={styles.field}>
          Teams (none picked: every team)
          <div className={styles.teamPick}>
            {teams.map((t) => (
              <button
                key={t.id}
                type="button"
                className={styles.chip}
                aria-pressed={edit.team_ids.includes(t.id)}
                onClick={() =>
                  setEdit({
                    ...edit,
                    team_ids: edit.team_ids.includes(t.id) ? edit.team_ids.filter((x) => x !== t.id) : [...edit.team_ids, t.id],
                  })
                }
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.fields}>
        <label className={styles.field}>
          Why we run it
          <textarea
            id="tp-ed-why"
            value={d.about?.why ?? ""}
            onChange={(e) => setAbout({ why: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          When we use it
          <textarea
            id="tp-ed-when"
            value={d.about?.when ?? ""}
            onChange={(e) => setAbout({ when: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          What to remember (one per line)
          <textarea
            id="tp-ed-keys"
            value={keysText}
            onChange={(e) => {
              setKeysText(e.target.value);
              const keys = e.target.value.split("\n").map((k) => k.trim()).filter(Boolean);
              setAbout({ keys });
            }}
          />
        </label>
      </div>

      <div className={styles.field}>
        Step
        <div className={styles.teamPick}>
          {d.steps.map((s, i) => (
            <button key={i} type="button" className={styles.chip} aria-pressed={i === k} onClick={() => setStepIdx(i)}>
              {i + 1}. {s.title}
            </button>
          ))}
          <button
            type="button"
            className={styles.chip}
            onClick={() => {
              change((draft) => void draft.steps.splice(k + 1, 0, { title: `Step ${k + 2}`, note: "", actions: [] }));
              setStepIdx(k + 1);
            }}
          >
            + Add a step
          </button>
        </div>
      </div>

      <p className={styles.small}>
        {k === 0 ? "Drag a yellow ring to move where a player starts. " : ""}
        Drag a small orange ring to change where a player goes.
      </p>
      <div className={styles.courtBox}>
        <Court frame={frame} handles={handles} onDrag={onDrag} label={`Editing step ${k + 1}`} />
      </div>

      <div className={styles.fields}>
        <label className={styles.field}>
          Step title
          <input id="tp-ed-step-title" value={step.title} onChange={(e) => change((draft) => void (draft.steps[k].title = e.target.value))} />
        </label>
        {k === 0 && (
          <label className={styles.field}>
            Starts with the ball
            <select id="tp-ed-ball" value={d.ball} onChange={(e) => change((draft) => void (draft.ball = e.target.value))}>
              {ids.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        )}
        {timed && (
          <>
            <label className={styles.field}>
              In the video from (seconds)
              <input
                id="tp-ed-start"
                type="number"
                min={0}
                step={0.1}
                value={step.startSec ?? ""}
                onChange={(e) => change((draft) => void (draft.steps[k].startSec = e.target.value === "" ? null : Number(e.target.value)))}
              />
            </label>
            <label className={styles.field}>
              To (seconds)
              <input
                id="tp-ed-end"
                type="number"
                min={0}
                step={0.1}
                value={step.endSec ?? ""}
                onChange={(e) => change((draft) => void (draft.steps[k].endSec = e.target.value === "" ? null : Number(e.target.value)))}
              />
            </label>
          </>
        )}
      </div>
      <label className={styles.field}>
        Caption
        <textarea id="tp-ed-note" value={step.note} onChange={(e) => change((draft) => void (draft.steps[k].note = e.target.value))} />
      </label>
      <div className={styles.field}>
        What happens in this step
        {step.actions.length === 0 && <span className={styles.small}>Nothing yet.</span>}
        {step.actions.map(actionRow)}
        <div className={styles.row}>
          <button type="button" className={styles.btn} onClick={addMove}>
            + Move a player
          </button>
          <button type="button" className={styles.btn} onClick={addPass}>
            + Pass
          </button>
          {d.steps.length > 1 && (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={() => {
                change((draft) => void draft.steps.splice(k, 1));
                setStepIdx(Math.max(0, k - 1));
              }}
            >
              Remove this step
            </button>
          )}
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.row}>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving} onClick={() => onSave(edit)}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className={styles.btn} disabled={saving} onClick={onCancel}>
          Cancel
        </button>
        {confirmDelete ? (
          <>
            <span className={styles.small}>Delete this play and its video?</span>
            <button type="button" className={`${styles.btn} ${styles.btnDanger}`} disabled={saving} onClick={onDelete}>
              Delete play
            </button>
            <button type="button" className={styles.btn} onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
          </>
        ) : (
          <button type="button" className={`${styles.btn} ${styles.btnDanger}`} style={{ marginLeft: "auto" }} onClick={() => setConfirmDelete(true)}>
            Delete play…
          </button>
        )}
      </div>
    </div>
  );
}
