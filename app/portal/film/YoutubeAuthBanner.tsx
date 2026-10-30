import Link from "next/link";

// Shown on Film and Film status when the upload job couldn't sign in to
// YouTube. Without it, films just sit at "Queued for YouTube".
export function YoutubeAuthBanner({ message, canManage }: { message: string | null; canManage: boolean }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rsd-card"
      style={{ padding: "12px 14px", borderLeft: "4px solid var(--gw-error)", display: "flex", flexDirection: "column", gap: 4 }}
    >
      <div style={{ fontWeight: 800, fontSize: 14, color: "var(--gw-error)" }}>YouTube uploads are paused</div>
      <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.5 }}>
        {message} Films stay queued and send on their own once YouTube is connected again.
        {canManage ? (
          <>
            {" "}
            <Link href="/portal/settings?tab=film" style={{ fontWeight: 700 }}>
              Open Settings → Film
            </Link>
          </>
        ) : (
          " Ask a film manager to reconnect it."
        )}
      </div>
    </div>
  );
}
