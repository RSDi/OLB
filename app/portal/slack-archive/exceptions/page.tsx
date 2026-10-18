import { HashRedirect } from "../../../components/HashRedirect";
import { slackExceptionsHref } from "../../../../lib/slack-archive/paths";

export default function LegacySlackArchiveExceptionsPage() {
  return <HashRedirect to={slackExceptionsHref()} />;
}
