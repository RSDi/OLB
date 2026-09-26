import styles from "./site.module.css";
import { cssVars, cx } from "./util";

// A text block. Write plain h1–h4 / p / ul children; <Small> and <Large> are
// Squarespace's small and large paragraph styles.
export function Text({
  align,
  box,
  children,
}: {
  align?: "center";
  // Give the block the theme's background box (black with yellow text on the
  // default theme).
  box?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cx(styles.text, align === "center" && styles.alignCenter, box && styles.box)}>
      {children}
    </div>
  );
}

export function Small({ children }: { children?: React.ReactNode }) {
  return <p className={styles.smallText}>{children}</p>;
}

export function Large({ children }: { children?: React.ReactNode }) {
  return <p className={styles.largeText}>{children}</p>;
}

// Squarespace's double-underline text highlight.
export function Highlight({ children }: { children: React.ReactNode }) {
  return <span className={styles.highlight}>{children}</span>;
}

// A headline stretched to fill the block's width. `fit` is its font size as a
// percentage of that width, measured from the original site (it depends on
// the words, so re-measure if the text changes).
export function Scaled({ fit, children }: { fit: number; children: React.ReactNode }) {
  return (
    <div className={styles.scaled} style={cssVars({ "--fit": fit })}>
      <span className={styles.scaledLine}>{children}</span>
    </div>
  );
}
