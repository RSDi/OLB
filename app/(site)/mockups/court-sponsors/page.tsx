import type { Metadata } from "next";
import { Button } from "../../_components/Button";
import { Gallery } from "../../_components/Gallery";
import { Block, Section } from "../../_components/Section";
import { Text } from "../../_components/Text";
import { getSiteContent } from "../../../../lib/website/queries";
import styles from "../mockups.module.css";
import { CourtSponsorForm } from "./CourtSponsorForm";

export const metadata: Metadata = { title: "Court sponsors mock-up" };

// The Sponsors page as it would look with the Missouri River Shootout court
// sponsorship offer. Headline, Donate and the sponsor logos are the live ones
// from Settings → Website; the first button jumps to the new section.
export default async function CourtSponsorsMockupPage() {
  const content = await getSiteContent();
  const donate = content.link("sponsors.button.donate");
  const sponsors = content.list("sponsors.list").flatMap((s) => {
    const logo = s.image("logo");
    if (!logo) return [];
    const href = s.url("link");
    return [{ src: logo.src, alt: logo.alt || s.text("name"), href: href ?? undefined, newTab: !!href && !href.startsWith("/") }];
  });
  return (
    <>
      <Section theme="light" height="medium" divider={{ height: "8vw" }} rows={[14, 14]}>
        <Block m="1/2/10/10" d="1/5/9/23">
          <Text>
            <h3>{content.text("sponsors.intro")}</h3>
          </Text>
        </Block>
        <Block m="11/2/13/10" d="10/12/12/16" align="center">
          <Button href="#court-sponsors">Become A Sponsor</Button>
        </Block>
        <Block m="13/2/15/10" d="13/12/15/16" align="center">
          <Button href={donate.href}>{donate.label}</Button>
        </Block>
      </Section>

      <div id="court-sponsors" className={styles.anchor}>
        <Section theme="inverse" height="medium" rows={[3, 3]}>
          <Block m="1/2/2/10" d="1/3/2/13">
            <Text>
              <h2>Missouri River Shootout Court Sponsors</h2>
              <p>
                Put your name on a court at the Missouri River Shootout. Families, players and fans see your
                business all tournament long, and your support keeps homeschool basketball going in Omaha.
              </p>
              <p className={styles.price}>
                $1,000 per court
                <span>Only four courts. One sponsor each.</span>
              </p>
              <h4>Every court sponsor gets</h4>
              <ul className={styles.benefits}>
                <li>Naming rights to your own court</li>
                <li>Your logo and a link to your business on our website</li>
                <li>Your logo on our livestream all season</li>
                <li>Thank-you posts on Facebook and Instagram all season</li>
              </ul>
            </Text>
          </Block>
          <Block m="2/2/3/10" d="1/15/3/25">
            <Text>
              <h3>Become a Court Sponsor</h3>
              <p>Tell us about your business and we’ll follow up to reserve your court.</p>
            </Text>
            <CourtSponsorForm />
          </Block>
        </Section>
      </div>

      <Gallery theme="white" inset gutter={133} images={sponsors} />
    </>
  );
}
