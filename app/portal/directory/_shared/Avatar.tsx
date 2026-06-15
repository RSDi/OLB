// Reusable avatar bubble used across directory views. Falls back to the
// member's Gravatar (by email) when no explicit avatar_url is set, then to a
// User icon if there's no email.
import { Icons } from "../../../components/icons";
import { resolveAvatarUrl, type AvatarMember } from "../../../../lib/members/avatar";

export function Avatar({
  member,
  size = 40,
  ringed,
}: {
  member: AvatarMember;
  size?: number;
  ringed?: boolean;
}) {
  // Request ~2x for retina; Gravatar always returns an image (d=mp).
  const src = resolveAvatarUrl(member, Math.max(Math.round(size * 2), 80));
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        background: "var(--gw-bg-elev)",
        border: ringed ? "2px solid var(--gw-bg)" : "1px solid var(--gw-border)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        outline: ringed ? "1px solid var(--gw-border)" : "none",
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          style={{ objectFit: "cover", width: "100%", height: "100%" }}
        />
      ) : (
        <Icons.User
          width={Math.round(size * 0.45)}
          height={Math.round(size * 0.45)}
          style={{ color: "var(--gw-fg-muted)" }}
        />
      )}
    </div>
  );
}
