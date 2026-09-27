"use client";
import { useRef, useState } from "react";
import { Icons } from "../../components/icons";
import { Input, Pill, Textarea } from "../../components/ui";
import {
  clearPlayerRequirement,
  discardRequirementUpload,
  getRequirementFileUrl,
  markPlayerRequirement,
  type MarkPlayerRequirementInput,
} from "../../../lib/requirements/actions";
import { doneWord, formatAmount } from "../../../lib/requirements/logic";
import type { PlayerRequirement, PlayerRequirementStatus, Requirement } from "../../../lib/requirements/types";
import { REQUIREMENT_FILE_ACCEPT, uploadRequirementFile } from "../../../lib/requirements/upload";

type Choice = PlayerRequirementStatus | "missing";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const capStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: "var(--gw-fg-muted)",
};

// The board's check-off for one player on one requirement: Done (Paid for a
// fee), Waived, or Not yet, with the date, a note and an optional scan.
export function RequirementDialog({
  player,
  requirement: req,
  row,
  onClose,
}: {
  player: { id: string; full_name: string };
  requirement: Requirement;
  row: PlayerRequirement | null;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<Choice>(row?.status ?? "done");
  const [completedOn, setCompletedOn] = useState(row?.completed_on ?? today());
  const [note, setNote] = useState(row?.note ?? "");
  // The scan on record, unless it's been removed or replaced in this dialog.
  const [keptFile, setKeptFile] = useState(!!row?.file_path);
  const [upload, setUpload] = useState<{ path: string; name: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const done = doneWord(req.kind);
  const showFiles = req.allow_file || !!row?.file_path;

  async function dropUpload() {
    if (upload) await discardRequirementUpload(player.id, req.id, upload.path);
  }

  async function cancel() {
    await dropUpload();
    onClose();
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy("upload");
    const result = await uploadRequirementFile(player.id, req.id, file);
    setBusy(null);
    if (fileInput.current) fileInput.current.value = "";
    if (result.error || !result.path) {
      setError(result.error ?? "Upload failed.");
      return;
    }
    await dropUpload();
    setUpload({ path: result.path, name: file.name });
    setKeptFile(false);
  }

  async function viewScan() {
    setError(null);
    // Open the tab now so the browser doesn't block it as a pop-up.
    const tab = window.open("", "_blank");
    const result = await getRequirementFileUrl(player.id, req.id);
    if (result.url && tab) tab.location.href = result.url;
    else {
      tab?.close();
      setError(result.error ?? "Couldn't open the scan.");
    }
  }

  async function save() {
    setError(null);
    if (choice === "missing") {
      if (!row) {
        await cancel();
        return;
      }
      if (row.file_path && !confirm("Mark as not yet? The attached scan is deleted too.")) return;
      setBusy("save");
      await dropUpload();
      const result = await clearPlayerRequirement(player.id, req.id);
      setBusy(null);
      if (result.error) setError(result.error);
      else onClose();
      return;
    }
    const input: MarkPlayerRequirementInput = {
      playerId: player.id,
      requirementId: req.id,
      status: choice,
      completedOn,
      note,
    };
    if (upload) input.file = upload;
    else if (row?.file_path && !keptFile) input.file = null;
    setBusy("save");
    const result = await markPlayerRequirement(input);
    setBusy(null);
    if (result.error) setError(result.error);
    else onClose();
  }

  const options: { key: Choice; label: string }[] = [
    { key: "done", label: done },
    { key: "waived", label: "Waived" },
    { key: "missing", label: "Not yet" },
  ];
  const facts = [
    req.kind === "fee" && req.amount_cents != null && formatAmount(req.amount_cents),
    req.due_on && `Due ${formatDay(req.due_on)}`,
  ].filter(Boolean);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${req.name} for ${player.full_name}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) cancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(11,11,12,.38)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        style={{
          width: "min(460px, 100vw)",
          height: "100%",
          background: "var(--gw-bg-elev)",
          boxShadow: "-12px 0 40px rgba(0,0,0,.18)",
          padding: 24,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span style={capStyle}>{player.full_name}</span>
            <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>{req.name}</span>
            {facts.length > 0 && (
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-fg-muted)" }}>{facts.join(" · ")}</span>
            )}
            {req.description && (
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--gw-fg-muted)" }}>{req.description}</span>
            )}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={cancel}
            disabled={!!busy}
            style={{
              width: 36,
              height: 36,
              flexShrink: 0,
              borderRadius: "50%",
              border: "1px solid var(--gw-border)",
              background: "var(--gw-bg-elev)",
              color: "var(--gw-fg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Icons.X width={16} height={16} />
          </button>
        </div>

        <div
          role="radiogroup"
          aria-label="Status"
          style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 10, background: "var(--gw-border)", alignSelf: "flex-start" }}
        >
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={choice === o.key}
              onClick={() => setChoice(o.key)}
              style={{
                height: 34,
                padding: "0 16px",
                borderRadius: 8,
                border: "none",
                background: choice === o.key ? "var(--gw-bg-elev)" : "transparent",
                boxShadow: choice === o.key ? "0 1px 2px rgba(0,0,0,.08)" : "none",
                color: choice === o.key ? "var(--gw-fg)" : "var(--gw-fg-muted)",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>

        {choice !== "missing" && (
          <>
            <Input
              label={choice === "waived" ? "Waived on" : `${done} on`}
              type="date"
              value={completedOn}
              onChange={(e) => setCompletedOn(e.target.value)}
            />
            <Textarea
              label="Note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={req.kind === "fee" ? "e.g. Check #1042, or Venmo" : "Optional"}
              rows={2}
            />

            {showFiles && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ ...capStyle, fontSize: 12, letterSpacing: "0.04em", fontWeight: 600 }}>Scan</span>
                {keptFile && row?.file_path ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Icons.FileText width={14} height={14} />
                    <span style={{ fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" }}>{row.file_name ?? "Scan"}</span>
                    <Pill variant="light" size="sm" onClick={viewScan} disabled={!!busy}>
                      View scan
                    </Pill>
                    <Pill variant="ghost" size="sm" onClick={() => setKeptFile(false)} disabled={!!busy}>
                      Remove scan
                    </Pill>
                  </div>
                ) : upload ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Icons.CheckCircle width={14} height={14} />
                    <span style={{ fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" }}>{upload.name}</span>
                    <span style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>Attached when you save</span>
                  </div>
                ) : row?.file_path ? (
                  <span style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>The scan is removed when you save.</span>
                ) : null}
                {req.allow_file && (
                  <div>
                    <input
                      ref={fileInput}
                      type="file"
                      accept={REQUIREMENT_FILE_ACCEPT}
                      onChange={(e) => pickFile(e.target.files?.[0])}
                      style={{ display: "none" }}
                    />
                    <Pill variant="ghost" size="sm" onClick={() => fileInput.current?.click()} disabled={!!busy}>
                      <Icons.Image width={14} height={14} />
                      {busy === "upload" ? "Uploading…" : keptFile || upload ? "Replace scan" : "Upload scan"}
                    </Pill>
                  </div>
                )}
                <span style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>A photo or PDF, up to 10 MB. Only the board can open it.</span>
              </div>
            )}
          </>
        )}

        {row && (
          <span style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>
            Last marked {row.status === "waived" ? "waived" : done.toLowerCase()}
            {row.marked_by_name ? ` by ${row.marked_by_name}` : ""} on{" "}
            {new Date(row.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.
          </span>
        )}

        {error && (
          <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-error)" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: "auto" }}>
          <Pill variant="ghost" size="sm" onClick={cancel} disabled={!!busy}>
            Cancel
          </Pill>
          <Pill variant="accent" size="sm" onClick={save} disabled={!!busy}>
            {busy === "save" ? "Saving…" : "Save"}
          </Pill>
        </div>
      </div>
    </div>
  );
}
