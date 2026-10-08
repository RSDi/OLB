import type { Metadata } from "next";
import { Block, Section } from "../_components/Section";
import { SiteMarkdown } from "../_components/SiteMarkdown";
import { Text } from "../_components/Text";
import { getSiteContent } from "../../../lib/website/queries";

export const metadata: Metadata = { title: "History" };

export default async function HistoryPage() {
  // The words and background from Settings → Website.
  const content = await getSiteContent();
  return (
    <Section
      theme="white"
      height="large"
      background={{ image: content.image("history.background").src, wash: 0.15 }}
      rows={[9, 6]}
    >
      <Block m="1/2/9/10" d="1/4/6/24">
        <Text>
          <h1>{content.text("history.title")}</h1>
          <SiteMarkdown size="large">{content.text("history.body")}</SiteMarkdown>
        </Text>
      </Block>
    </Section>
  );
}
