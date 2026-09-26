import type { Metadata } from "next";
import { CLUB_EMAIL } from "../../../lib/contact/message";
import { ContactForm } from "../_components/ContactForm";
import { FacebookIcon, InstagramIcon } from "../_components/icons";
import { FACEBOOK_URL, INSTAGRAM_URL } from "../_components/links";
import { Block, Section } from "../_components/Section";
import styles from "../_components/site.module.css";
import { Text } from "../_components/Text";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <Section height="medium" rows={[22, 15]}>
      <Block m="1/2/7/10" d="1/2/10/12">
        <Text>
          <h2>Contact us.</h2>
          <ul>
            <li>
              <p>{CLUB_EMAIL}</p>
              <p />
              <p />
            </li>
          </ul>
          <p />
          <p />
        </Text>
      </Block>
      <Block m="7/2/9/10" d="14/2/16/12" align="center">
        <div className={styles.socialIcons}>
          <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className={styles.socialIcon}>
            <FacebookIcon variant="block" />
          </a>
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className={styles.socialIcon}>
            <InstagramIcon variant="block" />
          </a>
        </div>
      </Block>
      <Block m="9/2/23/10" d="1/14/14/26">
        <ContactForm />
      </Block>
    </Section>
  );
}
