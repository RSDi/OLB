import type { Metadata } from "next";
import converge from "../_images/sponsor-converge-church.png";
import grainworx from "../_images/sponsor-grainworx.png";
import krave from "../_images/sponsor-krave-gym.jpg";
import millard from "../_images/sponsor-millard-community-church.png";
import nelson from "../_images/sponsor-nelson-produce-farm.jpg";
import truthAndBeauty from "../_images/sponsor-truth-and-beauty.png";
import { Button } from "../_components/Button";
import { Gallery } from "../_components/Gallery";
import { Block, Section } from "../_components/Section";
import { Text } from "../_components/Text";

export const metadata: Metadata = { title: "Sponsors" };

export default function SponsorsPage() {
  return (
    <>
      <Section theme="light" height="medium" divider={{ height: "8vw" }} rows={[14, 14]}>
        <Block m="1/2/10/10" d="1/5/9/23">
          <Text>
            <h3>
              By becoming an Omaha Lightning Basketball sponsor, you help provide the Omaha homeschool community with
              enriching opportunities in sports and life.
            </h3>
          </Text>
        </Block>
        <Block m="11/2/13/10" d="10/12/12/16" align="center">
          <Button href="/contact">Become A Sponsor</Button>
        </Block>
        <Block m="13/2/15/10" d="13/12/15/16" align="center">
          <Button href="https://account.venmo.com/u/OmahaLightning-Basketball">Donate</Button>
        </Block>
      </Section>

      <Gallery
        theme="white"
        inset
        gutter={133}
        images={[
          { src: krave, alt: "Krave Gym", href: "https://elkhorn.kravegym.com", newTab: true },
          { src: nelson, alt: "Nelson Produce + Farm", href: "https://www.nelsonproducefarm.com" },
          { src: grainworx, alt: "GrainWorx", href: "https://www.rsdico.com/grainworx-features" },
          { src: converge, alt: "Converge Church", href: "https://www.convergechurchomaha.org" },
          { src: millard, alt: "Millard Community Church", href: "https://www.millardcommunitychurch.com" },
          {
            src: truthAndBeauty,
            alt: "Truth & Beauty Homeschool Collaborative",
            href: "https://truthandbeautyhomeschoolcollaborative.com",
          },
        ]}
      />
    </>
  );
}
