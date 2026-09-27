import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  PREVIEW_COOKIE,
  PREVIEW_EXIT_PATH,
  parsePreviewCookie,
  previewExpired,
} from "./lib/activity/preview-cookie";

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

  if (!user && request.nextUrl.pathname.startsWith("/portal")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // A "Preview as" past its 2-hour limit ends itself: the exit route signs
  // the member's session out and the super-admin back in. Read from the
  // cookie alone, so it costs no database call.
  const preview = parsePreviewCookie(request.cookies.get(PREVIEW_COOKIE)?.value);
  if (user && preview && previewExpired(preview) && request.nextUrl.pathname.startsWith("/portal")) {
    const url = request.nextUrl.clone();
    url.pathname = PREVIEW_EXIT_PATH;
    url.search = "?reason=expired";
    return NextResponse.redirect(url);
  }

  // Don't redirect away from /login if there's a status message (pending/denied)
  const hasStatus = request.nextUrl.searchParams.has("status");
  if (user && request.nextUrl.pathname === "/login" && !hasStatus) {
    const url = request.nextUrl.clone();
    url.pathname = "/portal";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/portal/:path*", "/login"],
};
