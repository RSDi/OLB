import Link from "next/link";
import basketball from "./_images/home-basketball.jpg";
import teamHeartland from "./_images/home-team-heartland.jpg";
import teamMedals from "./_images/home-team-medals.jpg";
import youngPlayers from "./_images/home-young-players.jpg";
import { Gallery } from "./_components/Gallery";
import { Picture } from "./_components/Picture";
import { Block, Section } from "./_components/Section";
import { Scaled, Small, Text } from "./_components/Text";

const CUSTOM = { minHeight: "10vh", padding: "1vmax" };

export default function HomePage() {
  return (
    <>
      <Section theme="white" height={CUSTOM} divider={{ height: "6vw", tip: 75, stroke: true }} rows={[10, 8]}>
        <Block m="2/2/11/10" d="1/2/9/26" align="center">
          <Text>
            <h4>
              <strong>Welcome to Omaha Lightning Basketball! </strong>
            </h4>
            <p>
              For over{" "}two decades, Omaha Lightning Basketball has served to create an opportunity for home
              school athletes from all over the Omaha metro and surrounding areas to experience the challenge,
              enjoyment, and personal development opportunities that competitive basketball can offer. Most
              importantly though, our goal is to provide these experiences in a Christian environment where young boys
              have the opportunity to grow into Godly Christian men. To learn more about the Lightning philosophy click{" "}
              <Link href="/philosophy">HERE</Link>.{" "}
            </p>
          </Text>
        </Block>
      </Section>

      <Section height={CUSTOM} rows={[17, 18]}>
        <Block m="2/2/10/10" d="2/2/19/16" align="center">
          <Picture
            src={basketball}
            alt="A basketball on the court at players' feet"
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
            <Small>
              Omaha Lightning Basketball exists to provide home educated boys the opportunity to participate in an
              organized competitive basketball program that has a distinctly Christian character.
            </Small>
            <Small>
              <strong>-MISSION-</strong>
            </Small>
            <Small>
              Provide an enriching environment that challenges players to mature physically, emotionally, and
              spiritually, thereby growing in grace, and in the knowledge of our Lord and Savior Jesus Christ.
            </Small>
            <Small>
              <strong>-VISION-</strong>
            </Small>
            <Small>
              That students develop into mature Christian adults who serve their families, churches, and communities
              according to the ideals espoused in Colossians 3:17; “And whatever you do in word or deed, do all in the
              name of the Lord Jesus, giving thanks to God the Father through Him.”
            </Small>
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
