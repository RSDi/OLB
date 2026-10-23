import styles from "./site.module.css";
import { Text } from "./Text";
import type { VisibleHomepageMessage } from "../../../lib/website/homepage-message";

// The callout in the yellow Our Programs hero. Same black-on-yellow box
// the old waitlist notice used. Hidden entirely when Settings → Messages
// has "Show message box" off (or the table isn't applied yet).
export function HomepageMessageBox({ message }: { message: VisibleHomepageMessage }) {
  const href = message.linkUrl;
  const label = message.linkText;
  return (
    <Text box>
      <p className={styles.homepageMessageBody}>{message.body}</p>
      {href && label ? (
        <p className={styles.homepageMessageLink}>
          <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined}>
            {label}
          </a>
        </p>
      ) : null}
    </Text>
  );
}
