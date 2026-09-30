"use client";
import { useEffect, useRef, useState } from "react";

// Signature capture with two modes (matching Cognito): Draw (canvas) or Type.
// Coming back to a signature already drawn (a step back in the wizard, or a
// switch to the full form) shows it, with Sign again to redo it.
export default function SignaturePad({
  mode,
  typedName,
  image = "",
  onMode,
  onTyped,
  onDraw,
}: {
  mode: "draw" | "type";
  typedName: string;
  image?: string;
  onMode: (m: "draw" | "type") => void;
  onTyped: (v: string) => void;
  onDraw: (dataUrl: string) => void;
}) {
  const [preview, setPreview] = useState(!!image);
  const showPad = mode === "draw" && !(preview && image);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const inked = useRef(false);

  useEffect(() => {
    if (!showPad) return;
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * dpr);
    c.height = Math.round(rect.height * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0a0a0a";
    inked.current = false;
  }, [showPad]);

  function point(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function down(e: React.PointerEvent) {
    e.preventDefault();
    drawing.current = true;
    last.current = point(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.current!.x, last.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    inked.current = true;
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (inked.current) onDraw(canvasRef.current!.toDataURL("image/png"));
  }
  function clear() {
    const c = canvasRef.current;
    if (c) {
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, c.width, c.height);
    }
    inked.current = false;
    onDraw("");
  }

  return (
    <div style={{ marginTop: 6 }}>
      <div className="olb-sigtabs">
        <button type="button" className={"olb-sigtab" + (mode === "draw" ? " olb-sigtab--on" : "")} onClick={() => onMode("draw")}>Draw</button>
        <button type="button" className={"olb-sigtab" + (mode === "type" ? " olb-sigtab--on" : "")} onClick={() => onMode("type")}>Type</button>
      </div>

      {mode === "type" ? (
        <input
          className="olb-input"
          value={typedName}
          onChange={(e) => onTyped(e.target.value)}
          placeholder="Type your full name"
          style={{ marginTop: 8, fontFamily: '"Segoe Script", "Brush Script MT", cursive', fontSize: 22 }}
        />
      ) : !showPad ? (
        <div style={{ marginTop: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL of the drawn signature */}
          <img
            src={image}
            alt="Your signature"
            className="olb-sigcanvas"
            style={{ width: "100%", height: 130, objectFit: "contain" }}
          />
          <button
            type="button"
            className="olb-btn olb-btn--ghost olb-btn--sm"
            onClick={() => {
              setPreview(false);
              onDraw("");
            }}
            style={{ marginTop: 6 }}
          >
            Sign again
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <canvas
            ref={canvasRef}
            className="olb-sigcanvas"
            style={{ width: "100%", height: 130, touchAction: "none" }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
          />
          <button type="button" className="olb-btn olb-btn--ghost olb-btn--sm" onClick={clear} style={{ marginTop: 6 }}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
