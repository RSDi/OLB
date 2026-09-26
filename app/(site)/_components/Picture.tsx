import Image, { type StaticImageData } from "next/image";
import styles from "./site.module.css";
import { cssVars, cx } from "./util";

// An image block. By default the image keeps its shape and is centered in the
// block; `stretch` makes it fill the block instead, cropped to fit.
export function Picture({
  src,
  alt = "",
  sizes,
  stretch,
  ratio,
  fit = "cover",
  focus,
  oval,
  radius,
  eager,
}: {
  src: StaticImageData;
  alt?: string;
  // Rendered width, for picking the right file size (next/image `sizes`).
  sizes: string;
  stretch?: boolean;
  // Frame shape as width ÷ height (default: the image's own).
  ratio?: number;
  fit?: "cover" | "contain";
  // Crop focal point, e.g. "27% 35%".
  focus?: string;
  // Crop to an ellipse (the coach portraits).
  oval?: boolean;
  radius?: string;
  // Load right away rather than lazily (for images in the first screenful).
  eager?: boolean;
}) {
  return (
    <div className={styles.picture}>
      <div
        className={cx(styles.frame, !stretch && styles.fitted, oval && styles.oval)}
        style={{ ...cssVars({ "--ratio": ratio ?? src.width / src.height }), borderRadius: radius }}
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          loading={eager ? "eager" : undefined}
          style={{ objectFit: fit, objectPosition: focus }}
        />
      </div>
    </div>
  );
}
