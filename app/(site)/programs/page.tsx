import type { Metadata } from "next";
import { Accordion } from "../_components/Accordion";
import { Button } from "../_components/Button";
import { Block, Section } from "../_components/Section";
import { Large, Text } from "../_components/Text";

export const metadata: Metadata = { title: "2026-27 Season" };

const WAITLIST_URL = "https://www.cognitoforms.com/OmahaLightningBasketball1/_10u14uCompetitiveWaitlist";
const ASSESSMENTS_URL = "https://www.cognitoforms.com/OmahaLightningBasketball1/OmahaLightningHighSchoolAssessments2026";

const PROGRAMS = [
  {
    title: "8U-12U Competitive (Waitlisted)",
    content: (
      <>
        <p>
          Our elementary competitive program is extremely popular and fills fast because of our amazing coaching staff
          and community. Our grade school program focuses on developing each individual player with fundamentals and
          sportsmanship while creating friendships through a common goal.
        </p>
        <p>-Season starts first week in October and runs through February with a mid-December break.</p>
        <ul>
          <li>
            <p>
              <strong>Two practices per week (90-120 min each)</strong>
            </p>
          </li>
          <li>
            <p>
              <strong>15-20 games per season</strong>
            </p>
          </li>
          <li>
            <p>
              <strong>Practices: </strong>
            </p>
            <p>
              <strong>Tuesday:</strong>
              <br />
              <strong>10u, 5-7pm @ St. Mark’s</strong>
              <br />
              <strong>12u, 6-8pm @ St. Mark’s </strong>
              <br />
              <strong>( 1812 N. 90th St.)</strong>
            </p>
          </li>
          <li>
            <p>
              <strong>Thursday:</strong>
              <br />
              <strong>3-5pm @ UBT South</strong>
            </p>
          </li>
        </ul>
        <p>
          -Compete in the Conqueror basketball league FALL &amp; WINTER sessions. (games start second weekend in Oct.)
        </p>
        <p>-Will compete at the NCHC Regional Tournament in Lawrence, KS, Feb. 24-27, 2027.</p>
        <p>
          -4 qualified, Christian, volunteer coaches dedicated to investing in our elementary age group at every
          practice.
        </p>
        <p />
        <p>
          <strong>Registration fee: $375</strong>
        </p>
      </>
    ),
  },
  {
    title: "14U Competitive (Waitlisted)",
    content: (
      <>
        <p>
          Our 14U competitive program is extremely popular and fills fast because of our amazing coaching staff and
          community. The 14U program focuses on developing each individual player while preparing them to compete at
          the High School level. These athletes will grow in sportsmanship, skill, athleticism, friendship, and a love
          for hard work as they strive for common goals in basketball and life.{"\u00a0"}
        </p>
        <p>-Season starts in October and runs through February with a mid-December break.</p>
        <ul>
          <li>
            <p>
              <strong>Two practices per week: </strong>
            </p>
            <p>
              <strong>Monday 4-6pm @ Creighton </strong>
            </p>
            <p>
              <strong>Thursday 5:30-7:30pm @ St. Mark&apos;s OR 6:30-8:30pm @ Papillion Landing </strong>
            </p>
          </li>
          <li>
            <p>
              <strong>25-30 games per season</strong>
            </p>
            <p />
          </li>
        </ul>
        <p>-Compete in the Conqueror Basketball League FALL &amp; WINTER</p>
        <p>
          -14U Teams play in additional &apos;“day trip” homeschool tournaments and an early season overnight
          tournament in Des Moines.
        </p>
        <p>-14U teams will also compete at the NCHC Homeschool Regional Tournament in Wichita, KS Feb. 24-27nd, 2027.</p>
        <p />
        <p>
          <strong>Registration fee: $400</strong>
        </p>
      </>
    ),
  },
  {
    title: "16U-18U Competitive",
    content: (
      <>
        <p>
          As a competitive high school program, players on our 16u and 18u teams are encouraged to solidify their
          fundamental basketball skills, physical conditioning, and team skills necessary to compete against other home
          school organizations throughout the Midwest. (<em>Travel is required at this level.)</em>
        </p>
        <p>-Practices begin in October and run through mid March with games beginning in November.</p>
        <ul>
          <li>
            <p>
              <strong>25-35 games per season</strong>
            </p>
          </li>
        </ul>
        <ul>
          <li>
            <p>
              <strong>3-6 out of town tournaments</strong>
            </p>
          </li>
          <li>
            <p>
              <strong>Two practices per week:</strong>
            </p>
            <p>
              <strong>Monday 4-6pm @ Creighton </strong>
              <br />
              <strong>Thursday 6:30-8:30pm @ Papillion Landing </strong>
            </p>
          </li>
          <li>
            <p>
              Compete in the Regional/National tournament (NCHC Regionals/Nationals, or NDII Tournament) in late
              February/early March.
            </p>
          </li>
        </ul>
        <p />
        <p>
          <strong>Registration Fee: $525</strong>
        </p>
      </>
    ),
  },
];

export default function ProgramsPage() {
  return (
    <>
      <Section height="medium" divider={{ height: "8vw" }} rows={[12, 12]}>
        <Block m="1/2/11/10" d="1/5/6/23">
          <Text>
            <h4>With 8 competitive teams, strength training &amp; summer clinics… </h4>
            <h3>Lightning Basketball has a program for everyone. Find yours below! </h3>
          </Text>
        </Block>
        <Block m="11/2/13/10" d="7/8/13/20">
          <Text box>
            <Large>
              <strong>
                {"8U-14U are currently waitlisted for the 2026-27 Season. Please register below.  We will reach out if space allows."}
              </strong>
            </Large>
          </Text>
        </Block>
      </Section>

      <Section theme="white" height="medium" rows={[16, 14]}>
        <Block m="1/2/4/10" d="1/2/4/11">
          <Text>
            <h2>Our Programs</h2>
          </Text>
        </Block>
        <Block m="4/2/11/10" d="3/15/15/26">
          <Accordion items={PROGRAMS} />
        </Block>
        <Block m="13/2/15/10" d="4/2/6/10" align="center">
          <Button href={WAITLIST_URL} newTab hover="grow">
            CLICK HERE TO JOIN THE WAITLIST FOR THE 8U-14U SEASON!
          </Button>
        </Block>
        <Block m="11/2/13/10" d="6/2/8/10" align="center">
          <Button href={ASSESSMENTS_URL} newTab hover="grow">
            CLICK HERE TO REGISTER FOR HIGH SCHOOL ASSESMENTS
          </Button>
        </Block>
        {/* The season registration for families already in the program. It
            lands on the portal Directory's New registrations page. */}
        <Block m="15/2/17/10" d="8/2/10/10" align="center">
          <Button href="/player-registration" hover="grow">
            CLICK HERE TO REGISTER A CURRENT PLAYER OR SIBLING FOR 2026-27
          </Button>
        </Block>
      </Section>
    </>
  );
}
