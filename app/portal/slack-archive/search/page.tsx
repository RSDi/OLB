import { HashRedirect } from "../../../components/HashRedirect";
import { slackSearchHref } from "../../../../lib/slack-archive/paths";

export default function LegacySlackArchiveSearchPage() {
  return <HashRedirect to={slackSearchHref()} />;
}
