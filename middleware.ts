import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  PREVIEW_COOKIE,
  PREVIEW_EXIT_PATH,
  parsePreviewCookie,
  previewExpired,
} from "./lib/activity/preview-cookie";
import {
  DEVICE_COOKIE_HTTP,
  DEVICE_COOKIE_HTTPS,
  cookieFlags,
  deviceCookieExpired,
  readDeviceCookie,
  safeReturnTo,
} from "./lib/auth/pairing-cookie";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  if (!user && (path.startsWith("/portal") || path.startsWith("/pair/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const next = safeReturnTo(path);
    url.search = next ? `?next=${encodeURIComponent(next)}` : "";
    return NextResponse.redirect(url);
  }

  // A "Preview as" past its 2-hour limit ends itself: the exit route signs
  // the member's session out and the super-admin back in. Read from the
  // cookie alone, so it costs no database call.
  const preview = parsePreviewCookie(request.cookies.get(PREVIEW_COOKIE)?.value);
  if (user && preview && previewExpired(preview) && path.startsWith("/portal")) {
    const url = request.nextUrl.clone();
    url.pathname = PREVIEW_EXIT_PATH;
    url.search = "?reason=expired";
    return NextResponse.redirect(url);
  }

  // Phone-paired car sessions only. No cookie → no extra work, so Slack /
  // email / password logins are unchanged.
  const device = readDeviceCookie((name) => request.cookies.get(name)?.value);
  if (user && device && path.startsWith("/portal")) {
    const blocked = deviceCookieExpired(device) || (await deviceRevoked(device.id));
    if (blocked) {
      await supabase.auth.signOut({ scope: "local" });
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      const res = NextResponse.redirect(url);
      for (const name of [DEVICE_COOKIE_HTTPS, DEVICE_COOKIE_HTTP]) {
        res.cookies.set(name, "", { ...cookieFlags(name.startsWith("__Host-"), 0) });
      }
      return res;
    }
  }

  // Don't redirect away from /login if there's a status message (pending/denied)
  const hasStatus = request.nextUrl.searchParams.has("status");
  if (user && path === "/login" && !hasStatus) {
    const url = request.nextUrl.clone();
    const next = safeReturnTo(request.nextUrl.searchParams.get("next"));
    url.pathname = next ?? "/portal";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

async function deviceRevoked(id: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const res = await fetch(
      `${url}/rest/v1/device_pairings?id=eq.${encodeURIComponent(id)}&select=status,revoked_at,session_expires_at`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
      }
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as { status?: string; revoked_at?: string | null; session_expires_at?: string | null }[];
    const row = rows[0];
    if (!row) return false;
    if (row.status === "revoked" || row.revoked_at) return true;
    if (row.session_expires_at && Date.parse(row.session_expires_at) <= Date.now()) return true;
    return row.status !== "consumed";
  } catch {
    return false;
  }
}

export const config = {
  matcher: ["/portal/:path*", "/login", "/pair/:path*"],
};
