import type { Metadata } from "next";
import flyer from "../_images/summer-clinic-flyer.jpg";
import { Button } from "../_components/Button";
import { Picture } from "../_components/Picture";
import { Block, Section } from "../_components/Section";
import { Highlight, Large, Text } from "../_components/Text";

export const metadata: Metadata = { title: "Summer 2026" };

const REGISTRATION_URL =
  "https://www.cognitoforms.com/OmahaLightningBasketball1/_2026OmahaLightningSummerClinicRegistrationAges718";

export default function SummerPage() {
  return (
    <Section theme="white" height={{ minHeight: "0", padding: "0" }} rows={[45, 38]}>
      <Block m="2/2/11/8" d="2/3/9/11">
        <Text>
          <h2>SUMMER 2026 CLINICS</h2>
          <h3>
            <Highlight>
              <strong style={{ color: "#fb445a" }}>WAITLISTED!</strong>
            </Highlight>
          </h3>
        </Text>
      </Block>
      <Block m="10/2/28/10" d="10/3/24/12">
        <Text>
          <h3>7-18 </h3>
          <h4>
            <strong>8 Sessions = $60 </strong>
          </h4>
          <h4>
            <strong>For boys ages 7-18</strong>
          </h4>
          <p>
            <strong>Monday: 6-8pm | @ Concordia Lutheran School</strong>
          </p>
          <p>
            7/6, 7/13, 7/20, 7/27, 8/3, 8/10
            <br />
            <br />
            <strong>Saturday: 4-6pm | @ Concordia Lutheran School</strong>
            <br />
            7/25 &amp; 8/15
          </p>
          <Large>skills. fundamentals. teamwork. competition. fun!</Large>
          <Large>
            <strong>T-shirt included!</strong>
          </Large>
        </Text>
      </Block>
      <Block m="28/4/31/8" d="24/5/26/10" align="center">
        <Button href={REGISTRATION_URL} newTab hover="tilt">
          Join the Waitlist!
        </Button>
      </Block>
      <Block m="31/2/45/10" d="2/13/27/26" align="center">
        <Picture
          src={flyer}
          alt="Omaha Lightning's Summer Heat basketball clinics: 8 sessions for $60, July and August, ages 7-18, T-shirt included"
          fit="contain"
          sizes="(min-width: 768px) 50vw, 88vw"
          eager
        />
      </Block>
    </Section>
  );
}
