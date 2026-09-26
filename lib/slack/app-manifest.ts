// The Slack app this portal talks to, as a Slack app manifest
// (docs.slack.dev/reference/app-manifest). Every site runs its own app in its
// own workspace — api.slack.com/apps → Create New App → From a manifest — so
// moving the integration to another workspace or deployment is a paste plus
// a few env vars, not a click-through of scopes and URLs. Print one with
// `npm run slack-app-manifest` (scripts/slack-app-manifest.ts).
//
// Nothing here is specific to one site: the name and URLs come in as options,
// and the workspace is whichever one the app is created in. Keep the scopes in
// step with the code — a Slack Web API method or event the portal starts
// using needs its scope added here.
//
// Manifests can't carry an app icon; upload it under Basic Information →
// Display Information after creating the app.

export interface SlackAppManifestOptions {
  // The app's name, also used as the bot's display name (e.g. "Sparky").
  name: string;
  // Public base URL of the deployment Slack should call, e.g.
  // https://portal.example.org. Must be https.
  siteUrl: string;
  // The Supabase project URL (NEXT_PUBLIC_SUPABASE_URL), which "Continue with
  // Slack" sign-in redirects back through.
  supabaseUrl: string;
}

// Bot token scopes, and what uses each one.
export const SLACK_BOT_SCOPES = [
  "chat:write", // chat.postMessage: notifications (lib/notifications/slack.ts)
  "users:read", // users.info: who wrote a thread reply (api/slack/events) or archived message
  "users:read.email", // ...matched to a member by their Slack profile email
  "channels:history", // message.channels events, and archive history of public channels
  "groups:history", // message.groups events, and archive history of private channels
  "channels:read", // archive access (0084): conversations.info/members on public channels
  "groups:read", // archive access (0084): the same for private channels
  "files:read", // archive: downloading message attachments
];

// "Continue with Slack" is Supabase's slack_oidc provider, which asks for
// exactly these. Sign in with Slack accepts no other scopes.
const SLACK_USER_SCOPES = ["openid", "email", "profile"];

// Thread replies to the portal's posts come back through /api/slack/events.
const SLACK_BOT_EVENTS = ["message.channels", "message.groups"];

export interface SlackAppManifest {
  display_information: { name: string; description: string };
  features: { bot_user: { display_name: string } };
  oauth_config: { redirect_urls: string[]; scopes: { bot: string[]; user: string[] } };
  settings: {
    event_subscriptions: { request_url: string; bot_events: string[] };
    org_deploy_enabled: boolean;
    socket_mode_enabled: boolean;
    token_rotation_enabled: boolean;
  };
}

const MAX_NAME_LENGTH = 35; // Slack's limit for display_information.name

export function buildSlackAppManifest(opts: SlackAppManifestOptions): SlackAppManifest {
  const name = opts.name.trim();
  if (!name) throw new Error("The app needs a name.");
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`Slack app names can be at most ${MAX_NAME_LENGTH} characters ("${name}" is ${name.length}).`);
  }
  const site = httpsOrigin(opts.siteUrl, "site URL");
  const supabase = httpsOrigin(opts.supabaseUrl, "Supabase URL");

  return {
    display_information: {
      name,
      description: "Posts portal notifications, brings thread replies back to tasks, signs members in, and archives channels.",
    },
    features: {
      bot_user: { display_name: name },
    },
    oauth_config: {
      redirect_urls: [`${supabase}/auth/v1/callback`],
      scopes: { bot: [...SLACK_BOT_SCOPES], user: [...SLACK_USER_SCOPES] },
    },
    settings: {
      event_subscriptions: {
        request_url: `${site}/api/slack/events`,
        bot_events: [...SLACK_BOT_EVENTS],
      },
      org_deploy_enabled: false,
      socket_mode_enabled: false,
      token_rotation_enabled: false,
    },
  };
}

// Slack only calls https URLs. Paths and trailing slashes are dropped so
// "https://portal.example.org/" and "https://portal.example.org" agree.
function httpsOrigin(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`The ${label} "${value}" isn't a valid URL.`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`The ${label} must be an https URL that Slack can reach (got "${value}").`);
  }
  return url.origin;
}
