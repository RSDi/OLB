import type { CSSProperties } from "react";

export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

// Inline CSS custom properties, typed loosely enough for React's style prop.
export function cssVars(vars: Record<`--${string}`, string | number | undefined>): CSSProperties {
  return vars as CSSProperties;
}
