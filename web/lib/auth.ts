import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";
import { authenticateUser, type User } from "@/lib/db";
import { getServerByToken, touchServer, recordIpMismatchRejection, type ServerRecord } from "@/lib/redis";

const JWT_SECRET = () => new TextEncoder().encode(process.env.JWT_SECRET || "change-me-in-production");
const COOKIE_NAME = "f2b_token";

// ── Timing-Safe String Comparison ──

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch { return false; }
}

// ── API Key Auth (per-server token stored in Redis) ──

export type AuthFailReason = "no_token" | "token_mismatch" | "ip_mismatch";

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

  const server = await getServerByToken(key);
  if (!server) return { server: null, reason: "token_mismatch" };

  const clientIp = extractClientIp(request);

  if (server.registered_ip && server.registered_ip !== clientIp) {
    // Token is valid but IP does not match — log the rejection, do NOT update last_seen
    await recordIpMismatchRejection(server, clientIp, request.url, key);
    return { server: null, reason: "ip_mismatch" };
  }

  // Successful auth — update last_seen, last_ip, registered_ip on first contact
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
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
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
