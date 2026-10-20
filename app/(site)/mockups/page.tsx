import type { Metadata } from "next";
import { Block, Section } from "../_components/Section";
import { Text } from "../_components/Text";

export const metadata: Metadata = { title: "Mock-ups" };

export default function MockupsIndexPage() {
  return (
    <Section height="medium" rows={[2, 2]}>
      <Block m="1/2/3/10" d="1/5/3/23">
        <Text>
          <h2>Mock-ups</h2>
          <p>Click-throughs for reviewing ideas. Nothing here is live, and nothing is saved.</p>
        </Text>
      </Block>
    </Section>
  );
}
