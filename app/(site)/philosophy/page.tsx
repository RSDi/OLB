import type { Metadata } from "next";
import { Block, Section } from "../_components/Section";
import { SiteMarkdown } from "../_components/SiteMarkdown";
import { Text } from "../_components/Text";
import { getSiteContent } from "../../../lib/website/queries";

export const metadata: Metadata = { title: "Philosophy" };

export default async function PhilosophyPage() {
  // The words and banner from Settings → Website.
  const content = await getSiteContent();
  return (
    <>
      <Section
        theme="white"
        height="medium"
        background={{ image: content.image("philosophy.banner").src, wash: 0.15 }}
        rows={[8, 7]}
      >
        <Block m="4/2/9/10" d="3/5/6/13" align={["start", "end"]}>
          <Text>
            <h2>{content.text("philosophy.title")}</h2>
          </Text>
        </Block>
      </Section>

      <Section theme="white" height="medium" divider={{ height: "8vw" }} rows={[10, 32]}>
        <Block m="1/2/10/10" d="1/5/29/23">
          <Text>
            <SiteMarkdown>{content.text("philosophy.body")}</SiteMarkdown>
          </Text>
        </Block>
      </Section>
    </>
  );
}
