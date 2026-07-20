"use client";

export function PrintButton() {
  return (
    <button
      className="no-print"
      onClick={() => window.print()}
      style={{
        padding: "13px 28px",
        borderRadius: 100,
        border: "none",
        background: "#1a1a1a",
        color: "#fff",
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      Print this sign
    </button>
  );
}
