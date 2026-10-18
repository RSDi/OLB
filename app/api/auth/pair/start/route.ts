import { randomUUID } from "node:crypto";
import {
  deriveUserCode,
  hashSecret,
  hmacUserCode,
  newBrowserSecret,
  pairingSecret,
  requestCity,
  requestHost,
  requestIp,
  requestOrigin,
  startLimited,
} from "../../../../../lib/auth/pairing";
import { countPending, countRecentStarts, insertPairing } from "../../../../../lib/auth/pairing-store";
import { json, requestIsSecure, requireSameOrigin, setPairCookie } from "../../../../../lib/auth/pairing-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = requireSameOrigin(request);
  if (blocked) return blocked;

  const host = requestHost(request.headers, request.url);
  if (!host) return json({ error: "wrong_host" }, 403);

  const ip = requestIp(request.headers);
  try {
    const [recent, pending] = await Promise.all([countRecentStarts(ip), countPending()]);
    const limited = startLimited(recent, pending);
    if (limited) return json({ error: "rate_limited", message: limited }, 429);

    const id = randomUUID();
    const secret = newBrowserSecret();
    const secretHash = hashSecret(secret);
    const key = pairingSecret();
    const userCode = deriveUserCode(id, secretHash, key);

    await insertPairing({
      id,
      host,
      secretHash,
      userCodeHmac: hmacUserCode(userCode, key),
      deviceUa: request.headers.get("user-agent") ?? "",
      deviceIp: ip,
      deviceCity: requestCity(request.headers),
    });

    await setPairCookie({ id, secret }, requestIsSecure(request.headers, request.url));

    return json({
      id,
      user_code: userCode,
      expires_in: 180,
      pair_url: `${requestOrigin(request.headers, request.url)}/pair/${id}`,
      // Tesla Chromium often drops the HttpOnly pair cookie from fetch
      // Set-Cookie. The car keeps this in memory and sends it on poll.
      secret,
    });
  } catch (err) {
    console.error("[pair/start]", err);
    return json({ error: "failed" }, 500);
  }
}
