import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";
import { authenticateUser, type User } from "@/lib/db";
import { getServerByToken, touchServer, recordIpMismatchRejection, recordFqdnMismatchRejection, type ServerRecord } from "@/lib/redis";

const JWT_SECRET = () => new TextEncoder().encode(process.env.JWT_SECRET || "change-me-in-production");
const COOKIE_NAME = "f2b_token";

// ── Timing-Safe String Comparison ──

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch { return false; }
}

// ── API Key Auth (per-server token stored in Redis) ──

export type AuthFailReason =
  | "no_token"
  | "token_mismatch"
  | "ip_mismatch"
  | "fqdn_mismatch"
  | "fqdn_not_allowed";

export interface ApiKeyResult {
  server: ServerRecord | null;
  /** Populated when server is null, indicating why auth failed. */
  reason: AuthFailReason | null;
}

/**
 * Verify the x-api-key header against registered servers.
 * Returns the matching ServerRecord on success, or null on failure.
 * Side-effects on success only: updates last_seen / last_ip on the server record.
 * IP-mismatch rejections are logged to audit + failed_auth automatically.
 */
export async function verifyApiKey(request: Request): Promise<ServerRecord | null> {
  const { server } = await verifyApiKeyFull(request);
  return server;
}

/**
 * Like verifyApiKey but also returns the failure reason so the caller can
 * include it in its own pushFailedAuth entry.
 */
export async function verifyApiKeyFull(request: Request): Promise<ApiKeyResult> {
  const key = request.headers.get("x-api-key");
  if (!key) return { server: null, reason: "no_token" };

  const requestFqdn = extractRequestFqdn(request);

  // Step 1: Reject immediately if the FQDN is not in the allowlist
  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.length > 0 && !allowedOrigins.includes(requestFqdn)) {
    return { server: null, reason: "fqdn_not_allowed" };
  }

  // Step 2: Resolve token → server record
  const server = await getServerByToken(key);
  if (!server) return { server: null, reason: "token_mismatch" };

  const clientIp = extractClientIp(request);
  const publicUrl = extractPublicUrl(request);

  // Step 3: FQDN must match the server's registered domain
  if (server.registered_domain && server.registered_domain !== requestFqdn) {
    await recordFqdnMismatchRejection(server, clientIp, requestFqdn, publicUrl, key);
    return { server: null, reason: "fqdn_mismatch" };
  }

  // Step 4: IP must match the registered IP
  if (server.registered_ip && server.registered_ip !== clientIp) {
    await recordIpMismatchRejection(server, clientIp, requestFqdn, publicUrl, key);
    return { server: null, reason: "ip_mismatch" };
  }

  // All checks passed — update last_seen, last_ip
  await touchServer(server.id, clientIp);
  return { server, reason: null };
}

/** Read the raw x-api-key header without doing any DB lookup — used for logging. */
export function extractApiKey(request: Request): string | null {
  return request.headers.get("x-api-key");
}

/** Extract the requester's IP from standard proxy headers, falling back to "unknown". */
export function extractClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Extract the public-facing hostname (no port, no scheme) from Cloudflare
 * Tunnel headers. Falls back to the Host header, then to the internal hostname.
 */
export function extractRequestFqdn(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "";
  // Strip any port suffix (e.g. "example.com:3000" → "example.com")
  return host.split(":")[0] ?? host;
}

/**
 * Return the list of allowed FQDNs from the ALLOWED_ORIGINS environment variable.
 * Returns an empty array when the env var is not set (allows all — dev-only).
 */
export function getAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Reconstruct the real public-facing URL from Cloudflare Tunnel headers.
 *
 * When running behind cloudflared, Next.js sees the internal bind address
 * (e.g. http://0.0.0.0:3000/api/ban) rather than the public FQDN.
 * Cloudflare injects three useful headers:
 *   - CF-Visitor:         {"scheme":"https"}   — the public scheme
 *   - X-Forwarded-Host:  f2b.callcenter-erp.com — the public hostname
 *   - X-Forwarded-Proto: https                 — alternative scheme header
 *
 * We combine those with the path from request.url to produce the correct URL
 * (e.g. https://f2b.callcenter-erp.com/api/ban).
 * Falls back gracefully to request.url when not behind Cloudflare.
 */
export function extractPublicUrl(request: Request): string {
  try {
    // Prefer the explicit forwarded host; fallback to the Host header
    const host =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host");

    if (!host) return request.url;

    // Cloudflare sends CF-Visitor: {"scheme":"https"}
    const cfVisitor = request.headers.get("cf-visitor");
    let scheme = "https"; // Cloudflare always terminates TLS
    if (cfVisitor) {
      try {
        const parsed = JSON.parse(cfVisitor) as { scheme?: string };
        if (parsed.scheme) scheme = parsed.scheme;
      } catch { /* ignore malformed CF-Visitor */ }
    } else {
      // Fallback: X-Forwarded-Proto (nginx / other proxies)
      scheme = request.headers.get("x-forwarded-proto") || "https";
    }

    // Extract only the path + query from the internal URL to avoid leaking
    // the internal host/port in the reconstructed URL.
    const internal = new URL(request.url);
    return `${scheme}://${host}${internal.pathname}${internal.search}`;
  } catch {
    return request.url;
  }
}


/** Fallback: also accept the legacy env API_KEY for backward compat */
export function verifyLegacyApiKey(request: Request): boolean {
  const key = request.headers.get("x-api-key");
  const expected = process.env.API_KEY || "";
  if (!expected || !key) return false;
  return safeEqual(key, expected);
}

// ── JWT Auth (for admin UI) ──

export async function createJwt(user: User): Promise<string> {
  return new SignJWT({ sub: user.username, role: user.role, uid: user.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(JWT_SECRET());
}

export interface JwtPayload { sub: string; role: string; uid: number; }

export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET());
    return payload as unknown as JwtPayload;
  } catch { return null; }
}

export async function getSessionFromCookies(): Promise<JwtPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyJwt(token);
}

// ── Credential Check ──

export async function checkCredentials(username: string, password: string): Promise<User | null> {
  return authenticateUser(username, password);
}

// ── Cookie Builder ──

export function buildSessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400${secure}`;
}

export function buildLogoutCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

export { COOKIE_NAME };
