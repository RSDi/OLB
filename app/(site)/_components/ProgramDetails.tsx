import { SiteMarkdown } from "./SiteMarkdown";

// The program write-up from Settings → Website. The Our Programs accordion
// and the assessment practice-times pop-up both render this, so the words
// stay the same.
export function ProgramDetails({ body }: { body: string }) {
  return <SiteMarkdown>{body}</SiteMarkdown>;
}
