"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Input, Textarea, Select, Pill } from "../../../components/ui";
import { createProject } from "../../../../lib/projects/actions";

interface Category {
  id: string;
  name: string;
}

export function NewProjectForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [budget, setBudget] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;
    setPending(true);
    setError(null);
    const res = await createProject({
      title,
      description,
      categoryId: categoryId || null,
      budget: budget.trim() ? Number(budget) : null,
    });
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.projectId) router.push(`/portal/tasks/projects/${res.projectId}`);
  }

  if (!open) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Pill variant="accent" size="md" onClick={() => setOpen(true)}>
          <Icons.Plus width={14} height={14} /> New project
        </Pill>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rsd-card" style={{ gap: 14 }}>
      <Input
        label="Title *"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Plan cigar night"
        autoFocus
        required
      />
      <Textarea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        placeholder="What is this project about?"
      />
      <Select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="">— None —</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Input
        label="Budget ($, optional)"
        type="number"
        min={0}
        step="0.01"
        value={budget}
        onChange={(e) => setBudget(e.target.value)}
        placeholder="e.g. 500"
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
        <Pill variant="ghost" size="md" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Pill>
        <Pill variant="accent" size="md" type="submit" disabled={pending || !title.trim()}>
          {pending ? "Creating…" : "Create project"}
        </Pill>
      </div>
    </form>
  );
}
