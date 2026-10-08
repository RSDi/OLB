import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { keepLineBreaks } from "../../../lib/website/content";
import { rehypeListParagraphs, rehypeSubheadingSpace } from "../../../lib/website/markdown";
import { Large, Small } from "./Text";

// Page text edited in Settings → Website, written as markdown, in the site's
// own type styles. Put it inside a <Text> block (or anything styled as one).
// `size` gives every paragraph Squarespace's small or large paragraph style.
// Raw HTML and images aren't rendered. A bold line on its own gets space
// above it, and list items always hold paragraphs, as on the original pages
// (lib/website/markdown.ts).
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
      // The spacer paragraphs stay plain, like the original pages' <p />.
      if (size && node?.children.length) {
        return size === "small" ? <Small>{children}</Small> : <Large>{children}</Large>;
      }
      return <p>{children}</p>;
    },
    img: () => null,
  };
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeListParagraphs, rehypeSubheadingSpace]} components={components}>
      {keepLineBreaks(children)}
    </ReactMarkdown>
  );
}
