"use client";
// What the error pages show: the reason in plain words where there is one, a
// Reload button, and the details to send on. The crash is also sent to the
// server's logs (lib/errors/report.ts).
import { useEffect } from "react";
import { reportClientError } from "../../lib/errors/report";

export function ErrorDetails({ error, retry }: { error: Error & { digest?: string }; retry?: () => void }) {
  useEffect(() => {
    console.error(error);
    reportClientError({ message: error.message, stack: error.stack ?? "", digest: error.digest ?? "", url: window.location.href }).catch(() => {});
  }, [error]);
  const server = !!error.digest;
  return (
    <div style={{ maxWidth: 560, margin: "64px auto", padding: "0 16px", display: "flex", flexDirection: "column", gap: 12, fontFamily: "inherit" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>This page couldn&apos;t load</h1>
      <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
        {server ? "The server ran into a problem." : "Something went wrong in your browser while the page was starting."} Reload to try again.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => (retry ? retry() : window.location.reload())}
          style={{ padding: "10px 18px", borderRadius: 100, border: "none", background: "#111", color: "#fff", fontWeight: 700, cursor: "pointer" }}
        >
          Reload
        </button>
        <button type="button" onClick={() => window.history.back()} style={{ padding: "10px 18px", borderRadius: 100, border: "1px solid #ccc", background: "transparent", fontWeight: 700, cursor: "pointer" }}>
          Back
        </button>
      </div>
      <details open style={{ fontSize: 12.5, color: "#555" }}>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>Details to send on</summary>
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#f4f4f4", padding: 10, borderRadius: 8, marginTop: 8 }}>
          {[error.message, error.digest && `Digest: ${error.digest}`, (error.stack ?? "").split("\n").slice(1, 6).join("\n")].filter(Boolean).join("\n")}
        </pre>
      </details>
    </div>
  );
}
