import auth from "./auth.module.css";
import { Block, Section } from "./Section";
import { Text } from "./Text";

// The sign-in pages' layout, after the Contact page: the heading on the left
// and the form on the right; on phones, the form under the heading.
export function AuthSection({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <Section height="small" rows={[2, 1]}>
      <Block m="1/2/2/10" d="1/2/2/12">
        <Text>
          <h2>{title}</h2>
          <p>{intro}</p>
        </Text>
      </Block>
      <Block m="2/2/3/10" d="1/16/2/26">
        <div className={auth.auth}>{children}</div>
      </Block>
    </Section>
  );
}
