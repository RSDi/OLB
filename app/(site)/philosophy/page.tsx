import type { Metadata } from "next";
import net from "../_images/philosophy-net.jpg";
import { Block, Section } from "../_components/Section";
import { Text } from "../_components/Text";

export const metadata: Metadata = { title: "Philosophy" };

export default function PhilosophyPage() {
  return (
    <>
      <Section theme="white" height="medium" background={{ image: net, wash: 0.15 }} rows={[8, 7]}>
        <Block m="4/2/9/10" d="3/5/6/13" align={["start", "end"]}>
          <Text>
            <h2>Philosophy.</h2>
          </Text>
        </Block>
      </Section>

      <Section theme="white" height="medium" divider={{ height: "8vw" }} rows={[10, 32]}>
        <Block m="1/2/10/10" d="1/5/29/23">
          <Text>
            <p>
              For over{"\u00a0"}two decades, Omaha Lightning Basketball has served to create an opportunity for home school
              athletes from all over the Omaha metro and surrounding areas to experience the challenge, enjoyment, and
              personal development opportunities that competitive basketball can offer. Most importantly though, our
              goal is to provide these experiences in a Christian environment where young boys have the opportunity to
              grow into Godly Christian men. To that end, Omaha Lightning Basketball is devoted to THREE GUIDING
              PRINCIPLES...
            </p>
            <p />
            <p>
              <strong>-God-</strong>
            </p>
            <p>
              Above all else, we strive to use the experiences players encounter while practicing and playing the sport
              of basketball to teach our players Christ like character. We believe the situations players experience on
              the court emulate experiences they will face as they enter their adult lives. We seek to use these
              experiences as teaching tools to help players learn to respond in a way that glorifies Christ.{"\u00a0"}
            </p>
            <p />
            <p>
              <strong>-Family-</strong>
            </p>
            <p>
              Secondly, as players condition, practice, compete, win and lose together, we work to create a strong sense
              of community. Our goal is for players to build meaningful, positive relationships that will carry them
              through the challenges that occur during adolescent and teenage years. Through trial and victory, players
              learn and experience what it means to be a family and their responsibilities to that family.{"\u00a0"}
            </p>
            <p />
            <p>
              <strong>-Basketball-</strong>
            </p>
            <p>
              Lastly, we strive to provide a setting where home school students can achieve their full athletic
              potential. No matter the players skill level or previous basketball experiences, we set high expectation
              to continually improve. Through conditioning, practicing and game experiences, skilled coaches and the
              entire Omaha Lightning family encourage and help each player improve toward being the best athlete they
              can be.{"\u00a0"}
            </p>
          </Text>
        </Block>
      </Section>
    </>
  );
}
