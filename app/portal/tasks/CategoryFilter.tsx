"use client";
import { useRouter } from "next/navigation";

// The category filter as a single dropdown instead of a row of chips — one of
// the declutter moves on the Opportunities page. Each option carries the full
// href (built server-side with the current bucket/layout/view), so changing the
// select just navigates there.
interface CategoryOption {
  value: string;
  label: string;
  href: string;
}

export function CategoryFilter({ value, options }: { value: string; options: CategoryOption[] }) {
  const router = useRouter();
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)" }}>Category</span>
      <select
        value={value}
        onChange={(e) => {
          const opt = options.find((o) => o.value === e.target.value);
          if (opt) router.push(opt.href);
        }}
        style={{
          height: 34,
          padding: "0 12px",
          borderRadius: 100,
          border: "1px solid var(--gw-border)",
          background: "var(--gw-bg)",
          color: "var(--gw-fg)",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
