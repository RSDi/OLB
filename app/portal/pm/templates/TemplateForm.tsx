"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Input, Pill, Select, Textarea } from "../../../components/ui";
import {
  createTemplate,
  updateTemplate,
  softDeleteTemplate,
} from "../../../../lib/pm/actions";
import type { ScheduleKind } from "../../../../lib/pm/schedule";

interface Area {
  id: string;
  name: string;
}
interface Priority {
  id: string;
  label: string;
}

export interface TemplateInitialValues {
  id?: string;
  title: string;
  description: string;
  areaId: string;
  priorityId: string;
  scheduleKind: ScheduleKind;
  scheduleValue: number;
  steps: string[];
  active: boolean;
  perAsset: boolean;
  assetType: string;
}

const DEFAULTS: TemplateInitialValues = {
  title: "",
  description: "",
  areaId: "",
  priorityId: "",
  scheduleKind: "monthly_day",
  scheduleValue: 1,
  steps: [""],
  active: true,
  perAsset: false,
  assetType: "",
};

// Sentinel value for the "Apply to" dropdown meaning "every asset in this
// area, no type filter". Maps to perAsset=true + assetType=null on submit.
const APPLY_ANY = "__any__";

const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

interface AssetTypeRef {
  area_id: string | null;
  type: string | null;
}

export function TemplateForm({
  initial,
  areas,
  priorities,
  assetTypeRefs,
  canDelete,
}: {
  initial?: TemplateInitialValues;
  areas: Area[];
  priorities: Priority[];
  assetTypeRefs: AssetTypeRef[];
  canDelete?: boolean;
}) {
  const router = useRouter();
  const start = initial ?? DEFAULTS;
  const isEdit = Boolean(initial?.id);

  const [title, setTitle] = useState(start.title);
  const [description, setDescription] = useState(start.description);
  const [areaId, setAreaId] = useState(start.areaId);
  const [priorityId, setPriorityId] = useState(start.priorityId);
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>(start.scheduleKind);
  const [scheduleValue, setScheduleValue] = useState<number>(start.scheduleValue);
  const [steps, setSteps] = useState<string[]>(start.steps.length ? start.steps : [""]);
  const [active, setActive] = useState(start.active);
  const [perAsset, setPerAsset] = useState(start.perAsset);
  const [assetType, setAssetType] = useState(start.assetType);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pickScheduleKind(next: ScheduleKind) {
    setScheduleKind(next);
    // Reset value to a sensible default for the new kind.
    if (next === "monthly_day") setScheduleValue(1);
    else if (next === "weekly_day") setScheduleValue(1);
    else setScheduleValue(30);
  }

  function updateStep(idx: number, value: string) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? value : s)));
  }

  function addStep() {
    setSteps((prev) => [...prev, ""]);
  }

  function removeStep(idx: number) {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveStep(idx: number, direction: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev];
      const target = idx + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const input = {
        title: title.trim(),
        description: description.trim() || null,
        areaId: areaId || null,
        priorityId: priorityId || null,
        scheduleKind,
        scheduleValue,
        steps,
        active,
        perAsset,
        assetType: perAsset ? assetType.trim() || null : null,
      };
      const result = isEdit && initial?.id
        ? await updateTemplate(initial.id, input)
        : await createTemplate(input);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/portal/pm/templates");
    });
  }

  async function handleDelete() {
    if (!initial?.id) return;
    if (!confirm(`Move "${initial.title}" to the deleted bin?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await softDeleteTemplate(initial.id!);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/portal/pm/templates");
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rsd-card"
      style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 720 }}
    >
      <Input
        label="Title *"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Replace gym light bulbs"
        required
      />

      <Textarea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Anything the person doing this task needs to know."
        rows={3}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Select label="Area" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
          <option value="">— Choose an area —</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select
          label="Priority"
          value={priorityId}
          onChange={(e) => setPriorityId(e.target.value)}
        >
          <option value="">— Choose a priority —</option>
          {priorities.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>

      {(() => {
        const refsForArea = assetTypeRefs.filter((r) => !areaId || r.area_id === areaId);
        const typesForArea = Array.from(
          new Set(refsForArea.map((r) => r.type).filter((t): t is string => Boolean(t)))
        ).sort();
        const anyAssetsInArea = refsForArea.length > 0;

        // Compute the dropdown's current value from perAsset + assetType.
        const currentValue = !perAsset
          ? ""
          : assetType
          ? assetType
          : APPLY_ANY;
        const currentTypeMissing =
          perAsset && assetType && !typesForArea.includes(assetType);

        function handleChange(next: string) {
          if (next === "") {
            setPerAsset(false);
            setAssetType("");
          } else if (next === APPLY_ANY) {
            setPerAsset(true);
            setAssetType("");
          } else {
            setPerAsset(true);
            setAssetType(next);
          }
        }

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Select
              label="Apply to"
              value={currentValue}
              onChange={(e) => handleChange(e.target.value)}
            >
              <option value="">Single task for the area</option>
              {anyAssetsInArea && (
                <option value={APPLY_ANY}>
                  Each asset {areaId ? "in this area" : "(any area)"}
                </option>
              )}
              {typesForArea.map((t) => (
                <option key={t} value={t}>
                  Each &ldquo;{t}&rdquo; asset{areaId ? " in this area" : ""}
                </option>
              ))}
              {currentTypeMissing && (
                <option value={assetType}>{assetType} (no matching assets)</option>
              )}
            </Select>
            <span
              style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5 }}
            >
              {!anyAssetsInArea
                ? areaId
                  ? "No assets in this area yet. Add some in Settings → Assets to enable per-asset PM."
                  : "No assets registered yet. Add some in Settings → Assets to enable per-asset PM."
                : !perAsset
                ? "One instance per generation. Pick a per-asset option above to spawn a sub-task per matching asset."
                : assetType
                ? `Each generation creates one sub-task per active "${assetType}" asset${
                    areaId ? " in this area" : ""
                  }.`
                : `Each generation creates one sub-task per active asset${
                    areaId ? " in this area" : ""
                  }, regardless of type.`}
            </span>
          </div>
        );
      })()}

      <fieldset
        style={{
          border: "1px solid var(--gw-border)",
          borderRadius: 10,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <legend
          style={{
            padding: "0 8px",
            fontSize: 12,
            fontWeight: 700,
            color: "var(--gw-fg-muted)",
            textTransform: "uppercase",
            letterSpacing: ".04em",
          }}
        >
          Schedule *
        </legend>

        <ScheduleRow
          checked={scheduleKind === "monthly_day"}
          onSelect={() => pickScheduleKind("monthly_day")}
          label={
            <>
              Monthly on day&nbsp;
              <input
                type="number"
                min={1}
                max={28}
                value={scheduleKind === "monthly_day" ? scheduleValue : 1}
                onChange={(e) => setScheduleValue(Number(e.target.value))}
                onFocus={() => pickScheduleKind("monthly_day")}
                disabled={scheduleKind !== "monthly_day"}
                style={inlineInputStyle}
              />
              &nbsp;(1–28)
            </>
          }
        />

        <ScheduleRow
          checked={scheduleKind === "weekly_day"}
          onSelect={() => pickScheduleKind("weekly_day")}
          label={
            <>
              Weekly on&nbsp;
              <select
                value={scheduleKind === "weekly_day" ? scheduleValue : 1}
                onChange={(e) => setScheduleValue(Number(e.target.value))}
                onFocus={() => pickScheduleKind("weekly_day")}
                disabled={scheduleKind !== "weekly_day"}
                style={{ ...inlineInputStyle, width: 140 }}
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </>
          }
        />

        <ScheduleRow
          checked={scheduleKind === "after_completion_days"}
          onSelect={() => pickScheduleKind("after_completion_days")}
          label={
            <>
              <input
                type="number"
                min={1}
                max={3650}
                value={scheduleKind === "after_completion_days" ? scheduleValue : 30}
                onChange={(e) => setScheduleValue(Number(e.target.value))}
                onFocus={() => pickScheduleKind("after_completion_days")}
                disabled={scheduleKind !== "after_completion_days"}
                style={inlineInputStyle}
              />
              &nbsp;days after last completion
            </>
          }
        />
      </fieldset>

      <fieldset
        style={{
          border: "1px solid var(--gw-border)",
          borderRadius: 10,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <legend
          style={{
            padding: "0 8px",
            fontSize: 12,
            fontWeight: 700,
            color: "var(--gw-fg-muted)",
            textTransform: "uppercase",
            letterSpacing: ".04em",
          }}
        >
          Checklist
        </legend>
        {steps.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span
              style={{
                width: 24,
                fontSize: 12,
                fontWeight: 700,
                color: "var(--gw-fg-muted)",
                textAlign: "center",
              }}
            >
              {i + 1}.
            </span>
            <input
              value={s}
              onChange={(e) => updateStep(i, e.target.value)}
              placeholder={`Step ${i + 1}`}
              style={{
                flex: 1,
                height: 36,
                padding: "0 12px",
                border: "1px solid var(--gw-border)",
                borderRadius: 8,
                fontSize: 13,
                background: "var(--gw-bg)",
                color: "var(--gw-fg)",
              }}
            />
            <RowIconBtn onClick={() => moveStep(i, -1)} disabled={i === 0} title="Move up">
              <Icons.ChevronLeft width={12} height={12} style={{ transform: "rotate(90deg)" }} />
            </RowIconBtn>
            <RowIconBtn
              onClick={() => moveStep(i, 1)}
              disabled={i === steps.length - 1}
              title="Move down"
            >
              <Icons.ChevronRight width={12} height={12} style={{ transform: "rotate(90deg)" }} />
            </RowIconBtn>
            <RowIconBtn
              onClick={() => removeStep(i)}
              disabled={steps.length === 1}
              title="Remove"
              danger
            >
              <Icons.X width={12} height={12} />
            </RowIconBtn>
          </div>
        ))}
        <button
          type="button"
          onClick={addStep}
          style={{
            alignSelf: "flex-start",
            padding: "6px 14px",
            borderRadius: 8,
            background: "var(--gw-bg-elev)",
            color: "var(--gw-fg)",
            border: "1px solid var(--gw-border)",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginTop: 4,
          }}
        >
          <Icons.Plus width={12} height={12} /> Add step
        </button>
      </fieldset>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          style={{ width: 16, height: 16 }}
        />
        Active (eligible for new instances)
      </label>

      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--gw-error-bg)",
            border: "1px solid rgba(229,62,62,.25)",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 13,
            color: "var(--gw-error)",
            fontWeight: 600,
          }}
        >
          <Icons.AlertCircle width={16} height={16} />
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
        <div>
          {isEdit && canDelete && (
            <Pill variant="ghost" size="sm" onClick={handleDelete} disabled={pending}>
              <Icons.Trash width={12} height={12} /> Delete template
            </Pill>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Pill
            variant="ghost"
            size="md"
            onClick={() => router.push("/portal/pm/templates")}
            disabled={pending}
          >
            Cancel
          </Pill>
          <Pill variant="accent" size="md" type="submit" disabled={pending || !title.trim()}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create template"}
          </Pill>
        </div>
      </div>
    </form>
  );
}

function ScheduleRow({
  checked,
  onSelect,
  label,
}: {
  checked: boolean;
  onSelect: () => void;
  label: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        fontSize: 14,
        color: "var(--gw-fg)",
      }}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onSelect}
        style={{ width: 16, height: 16 }}
      />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        {label}
      </span>
    </label>
  );
}

function RowIconBtn({
  children,
  onClick,
  disabled,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  title: string;
  danger?: boolean;
}) {
  const color = danger ? "var(--gw-error)" : "var(--gw-fg-muted)";
  const bg = danger ? "var(--gw-error-bg)" : "var(--gw-bg-elev)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: bg,
        color,
        border: `1px solid ${danger ? "rgba(229,62,62,.25)" : "var(--gw-border)"}`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

const inlineInputStyle: React.CSSProperties = {
  width: 64,
  height: 30,
  padding: "0 8px",
  border: "1px solid var(--gw-border)",
  borderRadius: 6,
  fontSize: 13,
  background: "var(--gw-bg)",
  color: "var(--gw-fg)",
};
