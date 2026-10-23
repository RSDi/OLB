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
      <Section height="medium" divider={{ height: "8vw" }} rows={[10, 8]}>
        <Block m="1/2/10/10" d="1/5/7/23">
          <Text>
            <h4>{content.text("programs.intro.lead")}</h4>
            <h3>{content.text("programs.intro.title")}</h3>
          </Text>
        </Block>
      </Section>

      <Section theme="white" height="medium" rows={[16, 14]}>
        <Block m="1/2/4/10" d="1/2/4/11">
          <Text>
            <h2>{content.text("programs.heading")}</h2>
          </Text>
        </Block>
        <Block m="4/2/12/10" d="3/15/15/26">
          <Accordion items={programs} />
        </Block>
        <Block m="13/2/16/10" d="4/2/6/10" align="center">
          <Button href={assess.href} hover="grow">
            {assess.label}
          </Button>
        </Block>
      </Section>
    </>
  );
}
