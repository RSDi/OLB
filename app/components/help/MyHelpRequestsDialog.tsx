"use client";
// ? → My requests: what I've asked for help with and the board's replies,
// newest activity first. Opening one clears its dot.
import { useCallback, useEffect, useState } from "react";
import { listMyHelpRequests, markMyHelpRead, replyToMyHelpRequest } from "../../../lib/help-requests/actions";
import type { HelpRequest } from "../../../lib/help-requests/model";
import { Icons } from "../icons";
import { Pill } from "../ui";
import { HelpDialog } from "./HelpDialog";
import { HelpThread, when } from "./HelpThread";

export function MyHelpRequestsDialog({ onClose, onAsk }: { onClose: () => void; onAsk: () => void }) {
  const [requests, setRequests] = useState<HelpRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listMyHelpRequests();
    if ("requests" in res) setRequests(res.requests);
    else setError(res.error);
  }, []);

  useEffect(() => {
    let live = true;
    listMyHelpRequests().then(
      res => {
        if (!live) return;
        if ("requests" in res) setRequests(res.requests);
        else setError(res.error);
      },
      () => live && setError("Couldn't load your requests."),
    );
    return () => {
      live = false;
    };
  }, []);

  const open = requests?.find(r => r.id === openId) ?? null;

  function openOne(r: HelpRequest) {
    setOpenId(r.id);
    if (r.askerUnread) {
      void markMyHelpRead(r.id);
      setRequests(list => list?.map(x => (x.id === r.id ? { ...x, askerUnread: false } : x)) ?? null);
    }
  }

  return (
    <HelpDialog
      title={open ? "Your request" : "My requests"}
      icon={<Icons.Inbox width={16} height={16} />}
      onClose={onClose}
      footer={
        open ? (
          <Pill variant="ghost" size="sm" onClick={() => setOpenId(null)} style={{ marginRight: "auto" }}>
            ← All my requests
          </Pill>
        ) : (
          <Pill variant="accent" size="sm" onClick={onAsk}>
            Ask for help
          </Pill>
        )
      }
    >
      {error && <span style={{ color: "var(--gw-error)", fontWeight: 600 }}>{error}</span>}
      {!error && requests === null && <span style={{ color: "var(--gw-fg-muted)" }}>Loading…</span>}
      {!error && requests?.length === 0 && (
        <span style={{ color: "var(--gw-fg-muted)" }}>
          Nothing yet. When you use <strong>Ask for help</strong>, your request and the board&apos;s replies show up here.
        </span>
      )}
      {open ? (
        <HelpThread
          request={open}
          onReply={async body => {
            const res = await replyToMyHelpRequest(open.id, body);
            if (res.error) return res.error;
            await load();
            return null;
          }}
        />
      ) : (
        requests &&
        requests.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {requests.map(r => {
              const last = r.messages[r.messages.length - 1];
              const status = r.closedAt ? "Closed" : last && !last.fromAsker ? "Answered" : "Waiting for a reply";
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => openOne(r)}
                  className="gw-press"
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid var(--gw-border)",
                    borderRadius: 10,
                    background: "var(--gw-bg)",
                    color: "var(--gw-fg)",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <span
                    aria-label={r.askerUnread ? "New reply" : undefined}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 8,
                      marginTop: 6,
                      flexShrink: 0,
                      background: r.askerUnread ? "var(--rsd-accent)" : "transparent",
                    }}
                  />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: 14,
                        fontWeight: r.askerUnread ? 800 : 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.body}
                    </span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--gw-fg-muted)" }}>
                      {status} · {when(r.updatedAt)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )
      )}
    </HelpDialog>
  );
}
