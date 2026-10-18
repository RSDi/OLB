import { HashRedirect } from "../../components/HashRedirect";
import { ARCHIVES_SLACK } from "../../../lib/slack-archive/paths";

export default function LegacySlackArchivePage() {
  return <HashRedirect to={ARCHIVES_SLACK} />;
}
