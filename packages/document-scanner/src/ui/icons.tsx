// The scanner's own icon set — copied so the package carries its visuals and
// has zero dependency on a host icon library. Same stroke style as the rest
// of the product (Feather-ish, currentColor).

import type { CSSProperties, ReactNode } from "react";

interface IconProps {
  width?: number;
  height?: number;
  style?: CSSProperties;
  className?: string;
}

const ico = (path: ReactNode, vb = "0 0 24 24") =>
  function Icon({ width = 16, height = 16, style, className }: IconProps) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={vb}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={style}
        className={className}
      >
        {path}
      </svg>
    );
  };

export const Icons = {
  Camera: ico(
    <>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  Image: ico(
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </>
  ),
  Plus: ico(
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  Trash: ico(
    <>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </>
  ),
};
