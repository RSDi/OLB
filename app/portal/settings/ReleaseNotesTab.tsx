"use client";
// Settings → Release Notes: the in-code list (lib/release-notes/releases.ts)
// as a timeline. Opening the panel marks the notes seen. "Show me how →"
// starts a guided tour (lib/help/tours.ts) when that tour can run for this
// person.

import { useEffect } from "react";
import { useTour } from "../../components/GuidedTour";
import {
  canManageFinances,
  canManageRegistrations,
  canManageTravel,
  canManageWebsite,
  canSlackDm,
  isStaff,
  type MemberLike,
} from "../../../lib/auth/permissions";
import type { GuideViewer } from "../../../lib/help/guide";
import { releaseTour } from "../../../lib/help/tours";
import { RELEASES, type Release } from "../../../lib/release-notes/releases";
import { markReleasesSeen } from "../../../lib/release-notes/seen";

function viewerFrom(me: MemberLike): GuideViewer {
  return {
    role: me.role,
    status: me.status,
    isStaff: isStaff(me),
    canManageFinances: canManageFinances(me),
    canManageRegistrations: canManageRegistrations(me),
    canManageTravel: canManageTravel(me),
    canSlackDm: canSlackDm(me),
    canManageWebsite: canManageWebsite(me),
    permissions: me.permissions,
  };
}

function tint(color: string, amount: number): string {
  return `color-mix(in srgb, ${color} ${amount}%, transparent)`;
}

export function ReleaseNotesTab({ me }: { me: MemberLike }) {
  const { start } = useTour();
  const viewer = viewerFrom(me);

  useEffect(() => {
    void markReleasesSeen();
  }, []);

  return (
    <div style={{ padding: "4px 0 32px" }}>
      <p
        style={{
          margin: "0 0 24px",
          fontSize: 13,
          color: "var(--gw-fg-muted)",
          fontWeight: 500,
          lineHeight: 1.6,
          maxWidth: 560,
        }}
      >
        What just shipped in the portal. Newest first. Tap{" "}
        <strong>Show me how →</strong> when a release changed something you can
        use, and a guided tour walks you through it.
      </p>
      {RELEASES.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          No release notes yet.
        </p>
      ) : (
        <div data-tour="release-notes-list" style={{ position: "relative" }}>
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 11,
              top: 8,
              bottom: 0,
              width: 2,
              background: "var(--gw-border)",
              borderRadius: 1,
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {RELEASES.map((release, i) => (
              <ReleaseRow
                key={release.version}
                release={release}
                last={i === RELEASES.length - 1}
                viewer={viewer}
                onStart={start}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReleaseRow({
  release,
  last,
  viewer,
  onStart,
}: {
  release: Release;
  last: boolean;
  viewer: GuideViewer;
  onStart: (id: string) => void;
}) {
  const tour = releaseTour(release.tour, viewer);
  return (
    <div style={{ display: "flex", gap: 20, paddingBottom: last ? 0 : 32 }}>
      <div
        style={{
          flexShrink: 0,
          width: 24,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 2,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: release.color,
            border: "2px solid var(--gw-bg)",
            boxShadow: `0 0 0 2px ${release.color}`,
            zIndex: 1,
            flexShrink: 0,
          }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: ".06em",
              padding: "2px 8px",
              borderRadius: 6,
              background: tint(release.color, 12),
              color: release.color,
            }}
          >
            {release.version}
          </span>
          <span
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: "var(--gw-fg)",
              letterSpacing: "-.01em",
            }}
          >
            {release.title}
          </span>
          <span
            style={{
              fontSize: 11,
              color: "var(--gw-fg-muted)",
              fontWeight: 500,
              marginLeft: "auto",
            }}
          >
            {release.date}
          </span>
        </div>
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          {release.features.map((f) => (
            <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: release.color,
                  marginTop: 7,
                  opacity: 0.7,
                }}
              />
              <span
                style={{
                  fontSize: 13,
                  color: "var(--gw-fg-muted)",
                  fontWeight: 500,
                  lineHeight: 1.5,
                }}
              >
                {f}
              </span>
            </li>
          ))}
        </ul>
        {tour && (
          <button
            type="button"
            onClick={() => onStart(tour.id)}
            data-tour="release-notes-show-how"
            className="gw-press"
            style={{
              marginTop: 10,
              padding: "6px 14px",
              minHeight: 36,
              borderRadius: 100,
              border: "1px solid var(--gw-border)",
              background: "var(--gw-bg-elev)",
              color: "var(--gw-fg)",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Show me how <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </div>
  );
}
