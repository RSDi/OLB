"use client";
// The board's Help Requests: Open and Closed tabs, the list on the left and
// the open request's conversation on the right (stacked on a phone).
import { useState } from "react";
import { listHelpRequests, replyToHelpRequest, setHelpRequestClosed } from "../../../lib/help-requests/actions";
import type { HelpRequest } from "../../../lib/help-requests/model";
import { HelpThread, when } from "../../components/help/HelpThread";
import { Pill } from "../../components/ui";

type Tab = "open" | "closed";

export function HelpRequestsView({
  initial,
  loadError,
  initialOpenId,
}: {
  initial: HelpRequest[];
  loadError: string | null;
  initialOpenId: string | null;
}) {
  const [tab, setTab] = useState<Tab>("open");
  const [requests, setRequests] = useState(initial);
  const [error, setError] = useState(loadError);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(
    initialOpenId && initial.some(r => r.id === initialOpenId) ? initialOpenId : null,
  );
  const open = requests.find(r => r.id === openId) ?? null;

  async function reload(next: Tab = tab, keepOpen: string | null = openId) {
    setLoading(true);
    const res = await listHelpRequests(next);
    setLoading(false);
    if (!("requests" in res)) {
      setError(res.error);
      return;
    }
    setError(null);
    setRequests(res.requests);
    setOpenId(keepOpen && res.requests.some(r => r.id === keepOpen) ? keepOpen : null);
  }

  function switchTab(next: Tab) {
    if (next === tab) return;
    setTab(next);
    void reload(next, null);
  }

  async function toggleClosed(r: HelpRequest) {
    const res = await setHelpRequestClosed(r.id, !r.closedAt);
    if (res.error) setError(res.error);
    else await reload(tab, null);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div role="tablist" style={{ display: "flex", gap: 8 }}>
        {(["open", "closed"] as Tab[]).map(t => (
          <Pill key={t} size="sm" variant={tab === t ? "dark" : "ghost"} onClick={() => switchTab(t)}>
            {t === "open" ? "Open" : "Closed"}
          </Pill>
        ))}
        {loading && <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", alignSelf: "center" }}>Loading…</span>}
      </div>
      {error && <span style={{ color: "var(--gw-error)", fontWeight: 600 }}>{error}</span>}

      <div className="rsd-help-requests" style={{ display: "grid", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {requests.length === 0 && !loading && (
            <span style={{ color: "var(--gw-fg-muted)", fontSize: 14 }}>
              {tab === "open" ? "Nothing waiting. Nice." : "No closed requests yet."}
            </span>
          )}
          {requests.map(r => {
            const active = r.id === openId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setOpenId(active ? null : r.id)}
                className="gw-press"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1px solid ${active ? "var(--rsd-accent)" : "var(--gw-border)"}`,
                  background: "var(--gw-bg-elev)",
                  color: "var(--gw-fg)",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <strong>{r.askerName}</strong>
                  {r.needsReply && !r.closedAt && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--rsd-accent-on)",
                        background: "var(--rsd-accent)",
                        borderRadius: 20,
                        padding: "1px 7px",
                      }}
                    >
                      Needs a reply
                    </span>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--gw-fg-muted)" }}>{when(r.updatedAt)}</span>
                </span>
                <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.body}</span>
                {r.pageTitle && <span style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>{r.pageTitle}</span>}
              </button>
            );
          })}
        </div>

        {open && (
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              border: "1px solid var(--gw-border)",
              background: "var(--gw-bg-elev)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <strong style={{ fontSize: 15 }}>{open.askerName}</strong>
              <span style={{ marginLeft: "auto" }} />
              <Pill size="sm" variant="ghost" onClick={() => void toggleClosed(open)}>
                {open.closedAt ? "Reopen" : "Close"}
              </Pill>
            </div>
            <HelpThread
              key={open.id}
              request={open}
              showPageDetails
              offerClose
              onReply={async (body, close) => {
                const res = await replyToHelpRequest(open.id, body, close);
                if (res.error) return res.error;
                await reload(tab, close && tab === "open" ? null : open.id);
                return null;
              }}
            />
          </div>
        )}
      </div>
      <style>{`
        @media (min-width: 900px) {
          .rsd-help-requests { grid-template-columns: minmax(260px, 380px) 1fr; }
        }
      `}</style>
    </div>
  );
}
