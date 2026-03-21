import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// ── Auth groups ──
//
//  PUBLIC       → only /api/auth/login + /login + /setup (no token required)
//  AGENT_API    → /api/ban, /api/unban, /api/sync  (x-api-key required)
//  PROTECTED    → everything else                  (JWT cookie required)

const PUBLIC_PATHS = ["/login", "/setup", "/invite", "/api/auth", "/api/invitations"];
const AGENT_PATHS  = ["/api/ban", "/api/sync"];

function matchesGroup(pathname: string, group: string[]): boolean {
  return group.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// ── CSP with per-request nonce ──
// Nonce is generated here and forwarded as the x-nonce request header so
// Server Components (layout.tsx) can apply it to <html nonce={...}> —
// that causes Next.js to propagate the nonce to its own inline hydration
// scripts, fixing the CSP "unsafe-inline" violation.
// Ref: https://nextjs.org/docs/app/guides/content-security-policy

function buildCSP(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";

  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' blob: data: https:`,
    `font-src 'self' data:`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ];

  return directives.join("; ");
}

function setSecurityHeaders(response: NextResponse, nonce: string): void {
  response.headers.set("Content-Security-Policy", buildCSP(nonce));
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "origin-when-cross-origin");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()");
}

// ── Proxy ──
// Next.js 16 renamed middleware → proxy.
// Ref: https://nextjs.org/docs/messages/middleware-to-proxy
//      https://nextjs.org/docs/app/getting-started/proxy

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Per-request nonce — forwarded to Server Components via x-nonce request header
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // Build forwarded request headers (includes nonce for the layout)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // ── Static assets: skip auth, no CSP needed ──
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // ── Public paths: /login, /setup, /api/auth/* ──
  if (matchesGroup(pathname, PUBLIC_PATHS)) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    setSecurityHeaders(response, nonce);
    return response;
  }

  // ── Agent API paths: require x-api-key (agent) OR JWT cookie (dashboard) ──
  // The proxy only enforces that SOME auth credential is present.
  // Full validation (timing-safe key lookup / JWT verify) happens in the route handler.
  if (matchesGroup(pathname, AGENT_PATHS)) {
    const hasApiKey = !!request.headers.get("x-api-key");
    const hasJwt    = !!request.cookies.get("f2b_token")?.value;
    if (!hasApiKey && !hasJwt) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    setSecurityHeaders(response, nonce);
    return response;
  }

  // ── All other paths: require JWT cookie ──
  const token = request.cookies.get("f2b_token")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET || "change-me-in-production"
    );
    await jwtVerify(token, secret);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    setSecurityHeaders(response, nonce);
    return response;
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
