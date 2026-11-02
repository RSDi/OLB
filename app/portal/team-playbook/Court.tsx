"use client";
// The half court, the players and the arrows for one moment of a play
// (lib/team-playbook/engine.ts works out the moment). In Edit, `handles`
// are spots that can be dragged: a player's starting spot, or a point a
// player moves to.

import { useRef } from "react";
import { BASKET, COURT, type Pt } from "../../../lib/team-playbook/diagram";
import { zigzag, type Frame, type Trail } from "../../../lib/team-playbook/engine";
import styles from "./playbook.module.css";

export interface Handle {
  key: string;
  x: number;
  y: number;
  label?: string; // a player's number; points show as small rings
}

const poly = (pts: Pt[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
const LINE = { stroke: "var(--court-line)", strokeWidth: 2.5, fill: "none" } as const;

function CourtLines() {
  return (
    <g>
      <rect x={-20} y={-45} width={540} height={525} fill="var(--gw-bg)" />
      <rect x={0} y={0} width={500} height={470} fill="var(--court)" />
      <rect x={190} y={0} width={120} height={190} fill="var(--court-paint)" />
      <rect x={0} y={0} width={500} height={470} {...LINE} />
      <rect x={190} y={0} width={120} height={190} {...LINE} />
      <path d="M190 190 A60 60 0 0 0 310 190" {...LINE} />
      <path d="M190 190 A60 60 0 0 1 310 190" {...LINE} strokeDasharray="8 8" />
      <path d="M52 0 L52 52 A198 198 0 0 0 448 52 L448 0" {...LINE} />
      <path d="M190 470 A60 60 0 0 1 310 470" {...LINE} />
      <line x1={220} y1={40} x2={280} y2={40} stroke="var(--court-line)" strokeWidth={3} />
      <circle cx={BASKET.x} cy={BASKET.y} r={9} fill="none" stroke="var(--ball)" strokeWidth={3} />
      <path d="M210 52 A40 40 0 0 0 290 52" {...LINE} strokeWidth={1.5} />
      {[70, 110, 140].map((y) => (
        <g key={y}>
          <line x1={182} y1={y} x2={190} y2={y} {...LINE} />
          <line x1={310} y1={y} x2={318} y2={y} {...LINE} />
        </g>
      ))}
      <text x={250} y={-28} textAnchor="middle" fontSize={12} fill="var(--gw-fg-muted)" letterSpacing={2}>
        BASELINE
      </text>
    </g>
  );
}

function TrailMark({ t }: { t: Trail }) {
  const op = t.faded ? 0.28 : 1;
  if (t.kind === "pass") {
    const [a, b] = t.pts;
    return (
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke="var(--ball)"
        strokeWidth={3}
        strokeDasharray="9 7"
        opacity={op}
        markerEnd={t.done ? "url(#tp-ah-ball)" : undefined}
      />
    );
  }
  const pts = t.kind === "dribble" ? zigzag(t.pts) : t.pts;
  let bar = null;
  if (t.kind === "screen" && t.done && t.pts.length > 1) {
    const p1 = t.pts[t.pts.length - 2];
    const p2 = t.pts[t.pts.length - 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const L = Math.hypot(dx, dy) || 1;
    const nx = (-dy / L) * 16;
    const ny = (dx / L) * 16;
    const ex = p2.x + (dx / L) * 20;
    const ey = p2.y + (dy / L) * 20;
    bar = (
      <line x1={ex - nx} y1={ey - ny} x2={ex + nx} y2={ey + ny} stroke="var(--trail)" strokeWidth={4} strokeLinecap="round" opacity={op} />
    );
  }
  return (
    <g>
      <polyline
        points={poly(pts)}
        fill="none"
        stroke="var(--trail)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={op}
        markerEnd={t.done && t.kind !== "screen" ? "url(#tp-ah)" : undefined}
      />
      {bar}
    </g>
  );
}

export function Court({
  frame,
  handles,
  onDrag,
  label,
}: {
  frame: Frame;
  handles?: Handle[];
  onDrag?: (key: string, p: Pt) => void;
  label: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<string | null>(null);

  const toCourt = (e: React.PointerEvent): Pt | null => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return {
      x: Math.round(Math.min(COURT.maxX, Math.max(COURT.minX, p.x))),
      y: Math.round(Math.min(COURT.maxY, Math.max(COURT.minY, p.y))),
    };
  };

  return (
    <svg
      ref={svgRef}
      className={styles.court}
      viewBox="-20 -45 540 525"
      role="img"
      aria-label={label}
      onPointerMove={(e) => {
        if (!dragging.current || !onDrag) return;
        const p = toCourt(e);
        if (p) onDrag(dragging.current, p);
      }}
      onPointerUp={() => (dragging.current = null)}
      onPointerLeave={() => (dragging.current = null)}
    >
      <defs>
        <marker id="tp-ah" viewBox="0 0 10 10" refX={-6} refY={5} markerWidth={5} markerHeight={5} orient="auto">
          <path d="M0 0L10 5L0 10z" fill="var(--trail)" />
        </marker>
        <marker id="tp-ah-ball" viewBox="0 0 10 10" refX={-6} refY={5} markerWidth={5} markerHeight={5} orient="auto">
          <path d="M0 0L10 5L0 10z" fill="var(--ball)" />
        </marker>
      </defs>
      <CourtLines />
      <g>
        {frame.trails.map((t, i) => (
          <TrailMark key={i} t={t} />
        ))}
      </g>
      <g>
        {Object.entries(frame.pos).map(([id, p]) => (
          <g key={id} transform={`translate(${p.x},${p.y})`}>
            <circle r={17} fill="var(--off)" stroke="var(--gw-bg-elev)" strokeWidth={2.5} />
            <text textAnchor="middle" dy={6} fontFamily="var(--rsd-display)" fontWeight={800} fontSize={20} fill="var(--off-fg)">
              {id}
            </text>
          </g>
        ))}
      </g>
      <circle cx={frame.ball.x} cy={frame.ball.y} r={9} fill="var(--ball)" stroke="var(--court-line)" strokeWidth={1.5} />
      {handles?.map((h) => (
        <g
          key={h.key}
          transform={`translate(${h.x},${h.y})`}
          style={{ cursor: "grab" }}
          onPointerDown={(e) => {
            (e.currentTarget.ownerSVGElement as SVGSVGElement | null)?.setPointerCapture?.(e.pointerId);
            dragging.current = h.key;
          }}
        >
          {h.label ? (
            <circle r={22} fill="none" stroke="var(--rsd-accent-fill)" strokeWidth={4} />
          ) : (
            <>
              <circle r={14} fill="transparent" />
              <circle r={8} fill="var(--gw-bg-elev)" stroke="var(--ball)" strokeWidth={3} />
            </>
          )}
        </g>
      ))}
    </svg>
  );
}
