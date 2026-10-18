import { HashRedirect } from "../../../components/HashRedirect";
import { slackChannelHref } from "../../../../lib/slack-archive/paths";

export default async function LegacySlackArchiveChannelPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const { channelId } = await params;
  return <HashRedirect to={slackChannelHref(decodeURIComponent(channelId))} />;
}
