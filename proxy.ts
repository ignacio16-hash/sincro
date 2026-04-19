// Next 16 proxy (formerly middleware.ts). Gates app routes by auth + role.
//
// Rules:
//   · /login                                     → always accessible
//   · /api/auth/*, GET /api/login-settings       → always accessible
//   · /api/webhooks/*, /api/cron/*               → always accessible (external)
//   · everything else                            → requires valid session cookie
//   · /stock, /orders                            → both roles
//   · everything else inside the app             → admin only
//
// Role check inside /api routes is enforced again in the route handlers — this
// proxy is the first line of defense, not the last.
import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/api/webhooks",
  "/api/cron",
  "/api/health",      // Railway healthcheck — must respond 200 sin auth
  "/_next",
  "/favicon.ico",
];

// Paths vendedor role can access (prefix-match).
const VENDEDOR_ALLOWED_PREFIXES = [
  "/stock",
  "/orders",
  "/api/stock",
  "/api/orders",
  "/api/auth",
  "/api/login-settings",   // read-only for login
];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return false; // root redirects to /dashboard → still needs auth
  // GET /api/login-settings is public (login page reads it)
  if (pathname === "/api/login-settings") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));
}

function isVendedorAllowed(pathname: string): boolean {
  return VENDEDOR_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = verifySession(token);

  if (!user) {
    // API routes → 401 JSON; page routes → redirect to /login
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Role gating
  if (user.role === "vendedor" && !isVendedorAllowed(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    // Send vendedor to /stock (their home)
    return NextResponse.redirect(new URL("/stock", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Exclude Next internals & static files; everything else is gated above.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
