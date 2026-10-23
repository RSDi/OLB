import type { Metadata } from "next";
import { Accordion } from "../_components/Accordion";
import { Button } from "../_components/Button";
import { Block, Section } from "../_components/Section";
import { SiteMarkdown } from "../_components/SiteMarkdown";
import { Text } from "../_components/Text";
import { getSiteContent } from "../../../lib/website/queries";
import { programPresentation } from "../../../lib/website/programs";

export const metadata: Metadata = { title: "2026-27 Season" };

// The words and program details come from Settings → Website. Status pills
// and which button shows are fixed to Rachel's mockup.
export default async function ProgramsPage() {
  const content = await getSiteContent();
  const programs = content.list("programs.list").map((p) => {
    const shown = programPresentation(p.text("title"));
    return {
      title: shown.title,
      pill: shown.pill,
      muted: shown.muted,
      content: <SiteMarkdown>{p.text("body")}</SiteMarkdown>,
    };
  });
  const assess = content.link("programs.button.assessments");
  return (
    <>
      <Section height={{ minHeight: "0", padding: "8vmax 0 0" }} divider={{ height: "8vw" }} rows={[6, 6]}>
        <Block m="1/2/6/10" d="1/4/6/22">
          <Text>
            <h4>{content.text("programs.intro.lead")}</h4>
            <h3>{content.text("programs.intro.title")}</h3>
          </Text>
        </Block>
      </Section>

      <Section theme="white" height={{ minHeight: "0", padding: "5vmax 0 8vmax" }} rows={[12, 12]}>
        <Block m="1/2/3/10" d="1/2/3/12">
          <Text>
            <h2>{content.text("programs.heading")}</h2>
          </Text>
        </Block>
        <Block m="3/2/10/10" d="3/14/11/26">
          <Accordion items={programs} />
        </Block>
        <Block m="10/2/12/10" d="4/2/6/12" align="center">
          <Button href={assess.href} hover="grow">
            {assess.label}
          </Button>
        </Block>
      </Section>
    </>
  );
}
