import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

// Shared plugin lists for every ReactMarkdown render across the app.
//
// rehype-raw lets <u>...</u> render so the Underline toolbar button works
// in playbooks. rehype-sanitize then strips anything dangerous (<script>,
// javascript: URLs) from staff-authored content. They MUST be used together
// — raw without sanitize is an XSS hole.
//
// Lives in its own (non-"use client") module so server components like the
// version history page can import these without dragging client code into
// the server bundle.

export const MD_REMARK_PLUGINS = [remarkGfm] as const;
export const MD_REHYPE_PLUGINS = [rehypeRaw, rehypeSanitize] as const;
