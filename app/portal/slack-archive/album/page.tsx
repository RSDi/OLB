import { HashRedirect } from "../../../components/HashRedirect";
import { ARCHIVES_ALBUM } from "../../../../lib/slack-archive/paths";

export default function LegacySlackArchiveAlbumPage() {
  return <HashRedirect to={ARCHIVES_ALBUM} />;
}
