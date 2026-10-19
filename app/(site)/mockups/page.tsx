import type { Metadata } from "next";
import Link from "next/link";
import { Block, Section } from "../_components/Section";
import { Text } from "../_components/Text";
import styles from "./mockups.module.css";

export const metadata: Metadata = { title: "Mock-ups" };

export default function MockupsIndexPage() {
  return (
    <Section height="medium" rows={[2, 2]}>
      <Block m="1/2/3/10" d="1/5/3/23">
        <Text>
          <h2>Mock-ups</h2>
          <p>Click-throughs for reviewing ideas. Nothing here is live, and nothing is saved.</p>
          <ul className={styles.list}>
            <li>
              <Link href="/mockups/registration-commitments">Registration commitments</Link>
              {" — "}a Yes/No question about other activities this season, and the staff flag that would follow.
            </li>
          </ul>
        </Text>
      </Block>
    </Section>
  );
}
