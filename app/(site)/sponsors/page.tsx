import type { Metadata } from "next";
import { Button } from "../_components/Button";
import { Gallery } from "../_components/Gallery";
import { Block, Section } from "../_components/Section";
import { Text } from "../_components/Text";
import { getSiteContent } from "../../../lib/website/queries";

export const metadata: Metadata = { title: "Sponsors" };

// The headline, buttons and sponsors come from Settings → Website.
export default async function SponsorsPage() {
  const content = await getSiteContent();
  const become = content.link("sponsors.button.become");
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
          <Button href={become.href}>{become.label}</Button>
        </Block>
        <Block m="13/2/15/10" d="13/12/15/16" align="center">
          <Button href={donate.href}>{donate.label}</Button>
        </Block>
      </Section>

      <Gallery theme="white" inset gutter={133} images={sponsors} />
    </>
  );
}
