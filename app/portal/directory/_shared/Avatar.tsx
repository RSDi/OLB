// Reusable avatar bubble used across directory views.
import { Icons } from "../../../components/icons";

interface AvatarLike {
  avatar_url: string | null;
}

export function Avatar({
  member,
  size = 40,
  ringed,
}: {
  member: AvatarLike;
  size?: number;
  ringed?: boolean;
}) {
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
      {member.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.avatar_url}
          alt=""
          width={size}
          height={size}
          style={{ objectFit: "cover", width: "100%", height: "100%" }}
        />
      ) : (
        <Icons.Users
          width={Math.round(size * 0.45)}
          height={Math.round(size * 0.45)}
          style={{ color: "var(--gw-fg-muted)" }}
        />
      )}
    </div>
  );
}
