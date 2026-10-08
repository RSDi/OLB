import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { keepLineBreaks } from "../../../lib/website/content";
import { Large, Small } from "./Text";

// Page text edited in Settings → Website, written as markdown, in the site's
// own type styles. Put it inside a <Text> block. `size` gives every paragraph
// Squarespace's small or large paragraph style. Raw HTML isn't rendered.
// A paragraph that's only bold words (like **-God-** on Philosophy) is a
// subheading: it gets the empty paragraph above it that the original pages
// used for spacing.
export function SiteMarkdown({ children, size }: { children: string; size?: "small" | "large" }) {
  const components: Components = {
    a: ({ href = "", children }) =>
      /^https?:\/\//i.test(href) ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      ) : (
        <Link href={href}>{children}</Link>
      ),
    p: ({ children, node }) => {
      const para =
        size === "small" ? <Small>{children}</Small> : size === "large" ? <Large>{children}</Large> : <p>{children}</p>;
      const only = node?.children.length === 1 ? node.children[0] : null;
      const subheading = only?.type === "element" && only.tagName === "strong";
      const first = node?.position?.start.offset === 0;
      return subheading && !first ? (
        <>
          <p />
          {para}
        </>
      ) : (
        para
      );
    },
    img: () => null,
  };
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {keepLineBreaks(children)}
    </ReactMarkdown>
  );
}
