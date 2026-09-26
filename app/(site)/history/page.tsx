import type { Metadata } from "next";
import net from "../_images/history-net.jpg";
import { Block, Section } from "../_components/Section";
import { Large, Text } from "../_components/Text";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage() {
  return (
    <Section theme="white" height="large" background={{ image: net, wash: 0.15 }} rows={[9, 6]}>
      <Block m="1/2/9/10" d="1/4/6/24">
        <Text>
          <h1>History.</h1>
          <Large>The Lightning Story… </Large>
          <Large>coming soon!</Large>
        </Text>
      </Block>
    </Section>
  );
}
