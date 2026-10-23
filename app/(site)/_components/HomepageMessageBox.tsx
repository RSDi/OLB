import styles from "./site.module.css";
import { Text } from "./Text";
import { programsHeroBoxHref, type VisibleHomepageMessage } from "../../../lib/website/homepage-message";

// The callout in the yellow Our Programs hero. Same black-on-yellow box
// the old waitlist notice used. Hidden entirely when Settings → Messages
// has "Show message box" off (or the table isn't applied yet). A Programs
// link becomes #14u so it opens that accordion instead of reloading.
export function HomepageMessageBox({ message }: { message: VisibleHomepageMessage }) {
  const href = programsHeroBoxHref(message.linkUrl);
  const label = message.linkText;
  const external = /^https?:\/\//i.test(href);
  return (
    <Text box>
      <p className={styles.homepageMessageBody}>{message.body}</p>
      {href && label ? (
        <p className={styles.homepageMessageLink}>
          <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
            {label}
          </a>
        </p>
      ) : null}
    </Text>
  );
}
