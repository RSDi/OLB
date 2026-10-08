import Image, { type StaticImageData } from "next/image";
import styles from "./site.module.css";
import { THEME_CLASS, type Theme } from "./Section";
import { cssVars, cx } from "./util";

export type GalleryImage = {
  src: StaticImageData;
  alt?: string;
  href?: string;
  newTab?: boolean;
};

// Squarespace's two-column masonry gallery section. Each image drops into
// whichever column is shorter so far, as the original does.
export function Gallery({
  images,
  gutter,
  theme,
  inset,
}: {
  images: GalleryImage[];
  // Squarespace's gutter setting (spacing grows with it).
  gutter: number;
  theme?: Theme;
  // Cap the gallery at the page's max width instead of running edge to edge.
  inset?: boolean;
}) {
  const columns: GalleryImage[][] = [[], []];
  const heights = [0, 0];
  for (const image of images) {
    const col = heights[0] <= heights[1] ? 0 : 1;
    columns[col].push(image);
    // Height per unit of column width, plus roughly one gap.
    heights[col] += image.src.height / image.src.width + 0.1;
  }

  return (
    <section
      className={cx(styles.section, styles.gallerySection, theme && THEME_CLASS[theme], inset && styles.galleryInset)}
    >
      <div className={styles.background} />
      <div className={styles.gallery}>
        <div className={styles.galleryColumns} style={cssVars({ "--gutter": gutter })}>
          {columns.map((column, i) => (
            <div key={i} className={styles.galleryColumn}>
              {column.map((image, j) => {
                const img = (
                  <Image
                    src={image.src}
                    alt={image.alt ?? ""}
                    sizes="(min-width: 768px) 46vw, 44vw"
                    className={styles.galleryItem}
                  />
                );
                if (!image.href) return <div key={j}>{img}</div>;
                return (
                  <a
                    key={j}
                    href={image.href}
                    {...(image.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  >
                    {img}
                  </a>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
