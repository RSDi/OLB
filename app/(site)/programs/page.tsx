import type { Metadata } from "next";
import { Accordion } from "../_components/Accordion";
import { Button } from "../_components/Button";
import { Block, Section } from "../_components/Section";
import { SiteMarkdown } from "../_components/SiteMarkdown";
import { Large, Text } from "../_components/Text";
import { getSiteContent } from "../../../lib/website/queries";

export const metadata: Metadata = { title: "2026-27 Season" };

// The words, programs and buttons come from Settings → Website.
export default async function ProgramsPage() {
  const content = await getSiteContent();
  const programs = content.list("programs.list").map((p) => ({
    title: p.text("title"),
    content: <SiteMarkdown>{p.text("body")}</SiteMarkdown>,
  }));
  const buttons = (["programs.button.waitlist", "programs.button.assessments", "programs.button.register"] as const).map(
    (key) => content.link(key),
  );
  return (
    <>
      <Section height="medium" divider={{ height: "8vw" }} rows={[12, 12]}>
        <Block m="1/2/11/10" d="1/5/6/23">
          <Text>
            <h4>{content.text("programs.intro.lead")}</h4>
            <h3>{content.text("programs.intro.title")}</h3>
          </Text>
        </Block>
        <Block m="11/2/13/10" d="7/8/13/20">
          <Text box>
            <Large>
              <strong>{content.text("programs.notice")}</strong>
            </Large>
          </Text>
        </Block>
      </Section>

      <Section theme="white" height="medium" rows={[16, 14]}>
        <Block m="1/2/4/10" d="1/2/4/11">
          <Text>
            <h2>{content.text("programs.heading")}</h2>
          </Text>
        </Block>
        <Block m="4/2/11/10" d="3/15/15/26">
          <Accordion items={programs} />
        </Block>
        <Block m="13/2/15/10" d="4/2/6/10" align="center">
          <Button href={buttons[0].href} newTab hover="grow">
            {buttons[0].label}
          </Button>
        </Block>
        <Block m="11/2/13/10" d="6/2/8/10" align="center">
          <Button href={buttons[1].href} newTab hover="grow">
            {buttons[1].label}
          </Button>
        </Block>
        {/* The season registration for families already in the program. It
            lands on the portal Directory's New registrations page. */}
        <Block m="15/2/17/10" d="8/2/10/10" align="center">
          <Button href={buttons[2].href} newTab hover="grow">
            {buttons[2].label}
          </Button>
        </Block>
      </Section>
    </>
  );
}
