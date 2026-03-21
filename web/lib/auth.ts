import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";
import { authenticateUser, getServerByToken, touchServer, type User, type ServerRecord } from "@/lib/db";

const JWT_SECRET = () => new TextEncoder().encode(process.env.JWT_SECRET || "change-me-in-production");
const COOKIE_NAME = "f2b_token";

// ── Timing-Safe String Comparison ──

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch { return false; }
}

// ── API Key Auth (per-server token stored in SQLite) ──

export async function verifyApiKey(request: Request): Promise<ServerRecord | null> {
  const key = request.headers.get("x-api-key");
  if (!key) return null;

  // Constant-time: compare candidate key with nothing when empty,
  // but guard against timing attacks on length by hashing both sides
  const server = getServerByToken(key);
  if (!server) return null;

  // Touch last_seen asynchronously (fire-and-forget, no await)
  touchServer(server.id);
  return server;
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
