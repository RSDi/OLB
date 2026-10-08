import Link from "next/link";
import teamHeartland from "./_images/home-team-heartland.jpg";
import teamMedals from "./_images/home-team-medals.jpg";
import youngPlayers from "./_images/home-young-players.jpg";
import { Gallery } from "./_components/Gallery";
import { Picture } from "./_components/Picture";
import { Block, Section } from "./_components/Section";
import { SiteMarkdown } from "./_components/SiteMarkdown";
import { Scaled, Small, Text } from "./_components/Text";
import { getSiteContent } from "../../lib/website/queries";

const CUSTOM = { minHeight: "10vh", padding: "1vmax" };

export default async function HomePage() {
  // The words and photo from Settings → Website.
  const content = await getSiteContent();
  const photo = content.image("home.photo");
  return (
    <>
      <Section theme="white" height={CUSTOM} divider={{ height: "6vw", tip: 75, stroke: true }} rows={[10, 8]}>
        <Block m="2/2/11/10" d="1/2/9/26" align="center">
          <Text>
            <h4>
              <strong>{content.text("home.welcome.title")}</strong>
            </h4>
            <SiteMarkdown>{content.text("home.welcome.body")}</SiteMarkdown>
          </Text>
        </Block>
      </Section>

      <Section height={CUSTOM} rows={[17, 18]}>
        <Block m="2/2/10/10" d="2/2/19/16" align="center">
          <Picture
            src={photo.src}
            alt={photo.alt}
            stretch
            radius="10px"
            eager
            sizes="(min-width: 768px) 54vw, 88vw"
          />
        </Block>
        <Block m="11/2/17/10" d="2/18/19/26">
          <Text align="center">
            <Small>
              <strong>-PURPOSE-</strong>
            </Small>
            <SiteMarkdown size="small">{content.text("home.purpose")}</SiteMarkdown>
            <Small>
              <strong>-MISSION-</strong>
            </Small>
            <SiteMarkdown size="small">{content.text("home.mission")}</SiteMarkdown>
            <Small>
              <strong>-VISION-</strong>
            </Small>
            <SiteMarkdown size="small">{content.text("home.vision")}</SiteMarkdown>
            <Small />
          </Text>
        </Block>
      </Section>

      <Section height={CUSTOM} rows={[11, 21]}>
        <Block m="2/2/12/10" d="1/2/22/26">
          <Text>
            <Scaled fit={9.58}>
              <h1>
                Grade school
                <br />
                through High School
              </h1>
            </Scaled>
            <h1>—</h1>
            <Scaled fit={10.405}>
              <h1>There’s something</h1>
            </Scaled>
            <Scaled fit={17.69}>
              <h1>for all ages</h1>
            </Scaled>
          </Text>
        </Block>
      </Section>

      <Gallery
        gutter={150}
        images={[
          { src: teamHeartland, alt: "A Lightning team at the Heartland tournament" },
          { src: teamMedals, alt: "A Lightning team with their medals" },
          { src: youngPlayers, alt: "Three young Lightning players" },
        ]}
      />

      <Section theme="inverse" height="small" inset rows={[2, 10]}>
        <Block m="1/1/3/11" d="4/5/8/23" align="center">
          <Text>
            <Scaled fit={13.98}>
              <h2>
                <Link href="/programs">See Programs</Link>
              </h2>
            </Scaled>
          </Text>
        </Block>
      </Section>
    </>
  );
}
