import Image, { type StaticImageData } from "next/image";
import styles from "./site.module.css";
import { cssVars, cx } from "./util";

// Squarespace section color themes. Leave `theme` off for the site's default:
// black on yellow.
export type Theme = "white" | "light" | "inverse";

export const THEME_CLASS: Record<Theme, string> = {
  white: styles.themeWhite,
  light: styles.themeLight,
  inverse: styles.themeInverse,
};

// Preset heights, or a custom minimum height plus top/bottom padding.
type Height = "small" | "medium" | "large" | { minHeight: string; padding: string };

type Divider = {
  // Depth of the chevron cut into the section's bottom edge.
  height: string;
  // Where along the edge the point sits (default: the middle).
  tip?: number;
  // Outline the cut with a 6px black line.
  stroke?: boolean;
};

type Background = {
  image: StaticImageData;
  // A white wash over the image, 0–1.
  wash: number;
};

export function Section({
  theme,
  height,
  inset,
  divider,
  rule,
  background,
  rows,
  children,
}: {
  theme?: Theme;
  height?: Height;
  // Draw the background as a box inset from the page edges.
  inset?: boolean;
  divider?: Divider;
  // A 6px black rule straddling the section's bottom edge.
  rule?: boolean;
  background?: Background;
  // Lay children out on the fluid grid: [phone rows, desktop rows].
  rows?: [number, number];
  children: React.ReactNode;
}) {
  const tip = divider?.tip ?? 50;
  return (
    <section
      className={cx(
        styles.section,
        theme && THEME_CLASS[theme],
        typeof height === "string" && styles[height],
        inset && styles.inset,
        divider && styles.divider,
        rule && styles.rule,
      )}
      style={cssVars({
        "--section-min-height": typeof height === "object" ? height.minHeight : undefined,
        "--section-padding": typeof height === "object" ? height.padding : undefined,
        "--divider-height": divider?.height,
        "--divider-tip": divider ? `${tip}%` : undefined,
      })}
    >
      <div className={styles.background}>
        {background && (
          <>
            <Image
              src={background.image}
              alt=""
              fill
              sizes="100vw"
              loading="eager"
              className={styles.backgroundImage}
            />
            <div className={styles.overlay} style={{ opacity: background.wash }} />
          </>
        )}
      </div>
      <div className={styles.contentWrapper}>
        {rows ? (
          <div className={styles.grid} style={cssVars({ "--rows-m": rows[0], "--rows-d": rows[1] })}>
            {children}
          </div>
        ) : (
          children
        )}
      </div>
      {divider?.stroke && (
        <svg className={styles.dividerStroke} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline
            points={`0,0 ${tip},100 100,0`}
            fill="none"
            stroke="#000"
            strokeWidth="6"
            strokeLinecap="square"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </section>
  );
}

const ALIGN = { start: "flex-start", center: "center", end: "flex-end" };
type Align = keyof typeof ALIGN;

// One block on a section's grid. `m` and `d` are the phone and desktop grid
// areas ("row-start / column-start / row-end / column-end"), copied from the
// Squarespace layout. `align` places the content vertically in its area,
// optionally as [phone, desktop].
export function Block({
  m,
  d,
  align = "start",
  children,
}: {
  m: string;
  d: string;
  align?: Align | [Align, Align];
  children: React.ReactNode;
}) {
  const [alignM, alignD] = typeof align === "string" ? [align, align] : align;
  return (
    <div
      className={styles.block}
      style={cssVars({
        "--area-m": m,
        "--area-d": d,
        "--align-m": ALIGN[alignM],
        "--align-d": ALIGN[alignD],
      })}
    >
      {children}
    </div>
  );
}
