import Link from "next/link";
import styles from "./site.module.css";
import { cx } from "./util";

// A button block: fills its grid area. `hover` picks one of the original
// site's hover animations.
export function Button({
  href,
  newTab,
  hover,
  children,
}: {
  href: string;
  newTab?: boolean;
  hover?: "grow" | "tilt";
  children: React.ReactNode;
}) {
  const className = cx(styles.button, styles.stretched, hover && styles[hover]);
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      className={className}
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}
