"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Select, Textarea, Pill } from "../../../components/ui";
import { createTicket } from "../../../../lib/maintenance/actions";

interface Area {
  id: string;
  name: string;
}
interface Priority {
  id: string;
  key: string;
  label: string;
  chip_class: string;
}
interface Category {
  id: string;
  name: string;
}

export function MaintenanceRequestForm({
  areas,
  priorities,
  categories,
  initialDescription = "",
  initialPriorityKey = "",
  project = null,
  initialCategoryName = "",
}: {
  areas: Area[];
  priorities: Priority[];
  categories: Category[];
  initialDescription?: string;
  initialPriorityKey?: string;
  project?: { id: string; title: string } | null;
  initialCategoryName?: string;
}) {
  const router = useRouter();
  const presetPriorityId = priorities.find((p) => p.key === initialPriorityKey)?.id ?? "";
  const maintenanceId = categories.find((c) => c.name === "Maintenance")?.id ?? "";
  const presetCategoryId = initialCategoryName
    ? categories.find((c) => c.name.toLowerCase() === initialCategoryName.toLowerCase())?.id
    : undefined;
  const [categoryId, setCategoryId] = useState(presetCategoryId || maintenanceId || categories[0]?.id || "");
  // Area only applies to maintenance tasks.
  const showArea = categoryId === maintenanceId;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await createTicket(new FormData(e.currentTarget));
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          padding: "32px 8px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "var(--gw-success-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--gw-success)",
          }}
        >
          <Icons.CheckCircle width={24} height={24} />
        </div>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Task submitted</h3>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: "var(--gw-fg-muted)",
            maxWidth: 360,
            lineHeight: 1.6,
          }}
        >
          Thanks — your task was submitted.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <Pill
            variant="ghost"
            size="sm"
            onClick={() => {
              setSubmitted(false);
              setError(null);
            }}
          >
            Submit another
          </Pill>
          <Pill variant="accent" size="sm" onClick={() => router.push("/portal/tasks")}>
            View all tasks
          </Pill>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {project && (
        <>
          <input type="hidden" name="project_id" value={project.id} />
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--gw-fg-muted)",
              background: "var(--gw-bg-elev)",
              border: "1px solid var(--gw-border)",
              borderRadius: 8,
              padding: "10px 14px",
            }}
          >
            Adding to project: <strong style={{ color: "var(--gw-fg)" }}>{project.title}</strong>
          </div>
        </>
      )}
      <Select
        label="Category *"
        name="category_id"
        required
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
      >
        <option value="">Select a category…</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>

      {showArea && (
        <Select label="Area *" name="area_id" required>
          <option value="">Select an area…</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      )}

      <Select label="Priority *" name="priority_id" required defaultValue={presetPriorityId}>
        <option value="">Select a priority…</option>
        {priorities.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </Select>

      <Textarea
        label="Description *"
        name="description"
        placeholder="What is wrong, where exactly, and when you noticed it."
        rows={5}
        required
        defaultValue={initialDescription}
      />

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

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill
          variant="ghost"
          size="md"
          onClick={() => router.push("/portal/tasks")}
          disabled={pending}
        >
          Cancel
        </Pill>
        <Pill variant="accent" size="md" type="submit" disabled={pending}>
          {pending ? "Submitting…" : "Submit task"}
        </Pill>
      </div>
    </form>
  );
}
