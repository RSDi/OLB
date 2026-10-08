import Link from "next/link";
import bolt from "../_images/logo-bolt.png";
import { FACEBOOK_URL, INSTAGRAM_URL } from "./links";
import { Picture } from "./Picture";
import { Block, Section } from "./Section";
import styles from "./site.module.css";
import { SiteMarkdown } from "./SiteMarkdown";
import { Small, Text } from "./Text";

// The verse and tagline come from Settings → Website.
export function Footer({ verse, tagline }: { verse: string; tagline: string }) {
  return (
    <footer className={styles.footer}>
      <Section height="medium" rows={[10, 12]}>
        <Block m="1/2/5/10" d="1/5/6/23">
          <Text align="center">
            <h3>
              <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer">
                Facebook
              </a>
              {"  "}
              <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
                Instagram
              </a>
            </h3>
            <SiteMarkdown size="large">{verse}</SiteMarkdown>
            <Small>{tagline}</Small>
          </Text>
        </Block>
        <Block m="5/2/11/10" d="7/11/13/17" align="center">
          <Picture src={bolt} alt="Omaha Lightning" fit="contain" sizes="(min-width: 768px) 23vw, 88vw" />
        </Block>
      </Section>
      <Link href="/portal" className={styles.login}>
        Login
      </Link>
    </footer>
  );
}
