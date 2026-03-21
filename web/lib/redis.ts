// ── CIDR helpers ──

function ipToNum(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) | Number(oct), 0) >>> 0;
}

export function ipInCidr(ip: string, entry: string): boolean {
  if (!entry.includes("/")) return ip === entry;
  const [network, bits] = entry.split("/");
  if (!network || bits === undefined) return false;
  const maskBits = Number(bits);
  if (isNaN(maskBits) || maskBits < 0 || maskBits > 32) return false;
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
  return (ipToNum(ip) & mask) === (ipToNum(network) & mask);
}

import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL!;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(REDIS_URL, {
      password: REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 3,
      retryStrategy(times) { return Math.min(times * 200, 5000); },
    });
  }
  return redis;
}

// ── Key Helpers ──

export const keys = {
  ban:          (ip: string) => `ban:${ip}`,
  whitelist:    ()           => "whitelist",
  tempWhitelist:(ip: string) => `wl:${ip}`,
  audit:        ()           => "audit",
};

// ── Ban Operations ──

export interface BanRecord {
  ip: string;
  jail: string;
  server: string;
  timestamp: string;
  bantime: number;
  country?: string;
  city?: string;
  lat?: string;
  lon?: string;
}

export async function addBan(ban: BanRecord): Promise<void> {
  const r = getRedis();
  const key = keys.ban(ban.ip);
  await r.hset(key, ban as unknown as Record<string, string>);
  if (ban.bantime > 0) await r.expire(key, ban.bantime);
}

export async function removeBan(ip: string): Promise<void> {
  await getRedis().del(keys.ban(ip));
}

export async function getBan(ip: string): Promise<BanRecord | null> {
  const data = await getRedis().hgetall(keys.ban(ip));
  if (!data?.ip) return null;
  return { ...data, bantime: Number(data.bantime) || 0 } as BanRecord;
}

export async function getAllBans(): Promise<BanRecord[]> {
  const r = getRedis();
  const bans: BanRecord[] = [];
  let cursor = "0";
  do {
    const [next, foundKeys] = await r.scan(cursor, "MATCH", "ban:*", "COUNT", 200);
    cursor = next;
    for (const key of foundKeys) {
      const data = await r.hgetall(key);
      if (data?.ip) bans.push({ ...data, bantime: Number(data.bantime) || 0 } as BanRecord);
    }
  } while (cursor !== "0");
  return bans;
}

// ── Whitelist Operations (with CIDR matching) ──

export async function addToWhitelist(entry: string): Promise<void> {
  await getRedis().sadd(keys.whitelist(), entry);
}

export async function removeFromWhitelist(entry: string): Promise<void> {
  await getRedis().srem(keys.whitelist(), entry);
}

export async function getWhitelist(): Promise<string[]> {
  return getRedis().smembers(keys.whitelist());
}

export async function isWhitelisted(ip: string): Promise<boolean> {
  const r = getRedis();

  // Check exact match + CIDR ranges in permanent whitelist
  const entries = await r.smembers(keys.whitelist());
  for (const entry of entries) {
    if (ipInCidr(ip, entry)) return true;
  }

  // Check temporary 24h whitelist (exact match only)
  return (await r.exists(keys.tempWhitelist(ip))) === 1;
}

export async function addTempWhitelist(ip: string, ttl = 86400): Promise<void> {
  await getRedis().set(
    keys.tempWhitelist(ip),
    JSON.stringify({ ip, created_at: new Date().toISOString() }),
    "EX", ttl
  );
}

export async function getTempWhitelist(): Promise<string[]> {
  const r = getRedis();
  const ips: string[] = [];
  let cursor = "0";
  do {
    const [next, foundKeys] = await r.scan(cursor, "MATCH", "wl:*", "COUNT", 200);
    cursor = next;
    for (const key of foundKeys) ips.push(key.replace("wl:", ""));
  } while (cursor !== "0");
  return ips;
}

// ── Audit Log ──

export interface AuditEntry {
  action: string;
  ip: string;
  jail?: string;
  server?: string;
  actor?: string;
  timestamp: string;
}

export async function pushAudit(entry: AuditEntry): Promise<void> {
  const r = getRedis();
  await r.lpush(keys.audit(), JSON.stringify(entry));
  await r.ltrim(keys.audit(), 0, 999);
}

export async function getAuditLog(limit = 100): Promise<AuditEntry[]> {
  const raw = await getRedis().lrange(keys.audit(), 0, limit - 1);
  return raw.map((s) => JSON.parse(s));
}

// ── Pub/Sub ──

export async function publishEvent(channel: string, payload: Record<string, unknown>): Promise<void> {
  await getRedis().publish(channel, JSON.stringify(payload));
}
