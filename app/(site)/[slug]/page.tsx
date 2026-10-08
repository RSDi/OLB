import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Block, Section } from "../_components/Section";
import { SiteMarkdown } from "../_components/SiteMarkdown";
import { Text } from "../_components/Text";
import { getSitePage } from "../../../lib/website/queries";

// Pages added in Settings → Website → New pages, at /<address>. The site's
// own pages (/coaches, /programs…) are their own routes and always win; an
// address that isn't one of the new pages is a 404.

// Built on first visit, then cached like the other pages until a publish.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = await getSitePage((await params).slug);
  return page ? { title: page.text("title") } : {};
}

export default async function SitePage({ params }: { params: Promise<{ slug: string }> }) {
  const page = await getSitePage((await params).slug);
  if (!page) notFound();
  const banner = page.image("banner");

  // With a banner, the title sits on it like Philosophy's; without one, it
  // heads the text.
  if (!banner) {
    return (
      <Section theme="white" height="medium" divider={{ height: "8vw" }} rows={[2, 2]}>
        <Block m="1/2/3/10" d="1/5/3/23">
          <Text>
            <h2>{page.text("title")}</h2>
            <SiteMarkdown>{page.text("body")}</SiteMarkdown>
          </Text>
        </Block>
      </Section>
    );
  }

  return (
    <>
      <Section theme="white" height="medium" background={{ image: banner.src, wash: 0.15 }} rows={[8, 7]}>
        <Block m="4/2/9/10" d="3/5/6/23" align={["start", "end"]}>
          <Text>
            <h2>{page.text("title")}</h2>
          </Text>
        </Block>
      </Section>

      <Section theme="white" height="medium" divider={{ height: "8vw" }} rows={[2, 2]}>
        <Block m="1/2/3/10" d="1/5/3/23">
          <Text>
            <SiteMarkdown>{page.text("body")}</SiteMarkdown>
          </Text>
        </Block>
      </Section>
    </>
  );
}
