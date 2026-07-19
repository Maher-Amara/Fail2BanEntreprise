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
  serverNextId: ()           => "servers:next_id",
  serverRecord: (id: number) => `server:id:${id}`,
  serversByTokenHash: ()     => "servers:by_token_hash",
  serversByName: ()          => "servers:by_name",
  serverIps:    (id: number) => `server:id:${id}:ips`,
};

// ── Server Record and Operations ──

export interface ServerRecord {
  id: number;
  name: string;
  owner_id: number;
  last_seen: string | null;
  /** IP first seen for this server (set on first successful agent auth). */
  registered_ip: string | null;
  /** Most recent IP used by this server's agent. */
  last_ip: string | null;
  created_at: string;
  ip_mismatch?: boolean;
  token_reused?: boolean;
}

import { createHash, randomBytes } from "crypto";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateServerToken(): string {
  return `f2b_${randomBytes(24).toString("hex")}`;
}

export async function createServer(
  name: string,
  ownerId: number,
  opts?: { registeredIp?: string; token?: string }
): Promise<{ server: ServerRecord; token: string }> {
  const r = getRedis();

  // Unique name check
  const existingIdByName = await r.hget("servers:by_name", name);
  if (existingIdByName) {
    throw new Error("UNIQUE constraint failed: server name already exists");
  }

  const token = opts?.token ?? generateServerToken();
  const token_hash = hashToken(token);

  // Unique token check
  const existingIdByToken = await r.hget("servers:by_token_hash", token_hash);
  if (existingIdByToken) {
    throw new Error("UNIQUE constraint failed: token already exists");
  }

  const id = await r.incr("servers:next_id");
  const timestamp = new Date().toISOString();
  const registeredIp = opts?.registeredIp ?? null;

  const server: ServerRecord = {
    id,
    name,
    owner_id: ownerId,
    last_seen: null,
    registered_ip: registeredIp,
    last_ip: null,
    created_at: timestamp,
  };

  const pipeline = r.pipeline();
  pipeline.hset(`server:id:${id}`, {
    ...server,
    id: String(id),
    owner_id: String(ownerId),
    token_hash,
    ...(registeredIp ? { registered_ip: registeredIp } : {}),
  } as unknown as Record<string, string>);
  pipeline.hset("servers:by_name", name, String(id));
  pipeline.hset("servers:by_token_hash", token_hash, String(id));
  await pipeline.exec();

  return { server, token };
}

export async function createServerWithToken(
  name: string,
  token: string,
  ownerId: number,
  opts?: { registeredIp?: string }
): Promise<ServerRecord> {
  const r = getRedis();

  // Unique name check
  const existingIdByName = await r.hget("servers:by_name", name);
  if (existingIdByName) {
    throw new Error("UNIQUE constraint failed: server name already exists");
  }

  const token_hash = hashToken(token);

  // Unique token check
  const existingIdByToken = await r.hget("servers:by_token_hash", token_hash);
  if (existingIdByToken) {
    throw new Error("UNIQUE constraint failed: token already exists");
  }

  const id = await r.incr("servers:next_id");
  const timestamp = new Date().toISOString();
  const registeredIp = opts?.registeredIp ?? null;

  const server: ServerRecord = {
    id,
    name,
    owner_id: ownerId,
    last_seen: null,
    registered_ip: registeredIp,
    last_ip: null,
    created_at: timestamp,
  };

  const pipeline = r.pipeline();
  pipeline.hset(`server:id:${id}`, {
    ...server,
    id: String(id),
    owner_id: String(ownerId),
    token_hash,
    ...(registeredIp ? { registered_ip: registeredIp } : {}),
  } as unknown as Record<string, string>);
  pipeline.hset("servers:by_name", name, String(id));
  pipeline.hset("servers:by_token_hash", token_hash, String(id));
  await pipeline.exec();

  return server;
}

export async function getServerByToken(token: string): Promise<ServerRecord | undefined> {
  const r = getRedis();
  const token_hash = hashToken(token);
  const id = await r.hget("servers:by_token_hash", token_hash);
  if (!id) return undefined;
  return getServerById(Number(id));
}

export async function getServerById(id: number): Promise<ServerRecord | undefined> {
  const r = getRedis();
  const data = await r.hgetall(`server:id:${id}`);
  if (!data || !data.id) return undefined;
  return {
    id: Number(data.id),
    name: data.name,
    owner_id: Number(data.owner_id),
    last_seen: data.last_seen || null,
    registered_ip: data.registered_ip || null,
    last_ip: data.last_ip || null,
    created_at: data.created_at,
    ip_mismatch: data.ip_mismatch === "1",
    token_reused: data.token_reused === "1",
  };
}

export async function getAllServers(): Promise<ServerRecord[]> {
  const r = getRedis();
  const nameToId = await r.hgetall("servers:by_name");
  const ids = Object.values(nameToId);
  if (ids.length === 0) return [];

  const pipeline = r.pipeline();
  for (const id of ids) {
    pipeline.hgetall(`server:id:${id}`);
  }
  const results = await pipeline.exec();
  const servers: ServerRecord[] = [];
  for (const result of results || []) {
    const [err, data] = result as [Error | null, Record<string, string>];
    if (!err && data && data.id) {
      servers.push({
        id: Number(data.id),
        name: data.name,
        owner_id: Number(data.owner_id),
        last_seen: data.last_seen || null,
        registered_ip: data.registered_ip || null,
        last_ip: data.last_ip || null,
        created_at: data.created_at,
        ip_mismatch: data.ip_mismatch === "1",
        token_reused: data.token_reused === "1",
      });
    }
  }
  return servers.sort((a, b) => a.id - b.id);
}

export async function deleteServer(id: number): Promise<boolean> {
  const r = getRedis();
  const server = await getServerById(id);
  if (!server) return false;

  const rawData = await r.hgetall(`server:id:${id}`);
  const tokenHash = rawData.token_hash;

  const pipeline = r.pipeline();
  pipeline.del(`server:id:${id}`);
  pipeline.del(`server:id:${id}:ips`);
  pipeline.hdel("servers:by_name", server.name);
  if (tokenHash) {
    pipeline.hdel("servers:by_token_hash", tokenHash);
  }
  await pipeline.exec();
  return true;
}

export async function rotateServerToken(id: number): Promise<string | null> {
  const r = getRedis();
  const server = await getServerById(id);
  if (!server) return null;

  const rawData = await r.hgetall(`server:id:${id}`);
  const oldTokenHash = rawData.token_hash;

  const token = generateServerToken();
  const token_hash = hashToken(token);

  // Check if token already registered
  const existingId = await r.hget("servers:by_token_hash", token_hash);
  if (existingId) {
    throw new Error("UNIQUE constraint failed: token already exists");
  }

  const pipeline = r.pipeline();
  pipeline.hset(`server:id:${id}`, "token_hash", token_hash);
  if (oldTokenHash) {
    pipeline.hdel("servers:by_token_hash", oldTokenHash);
  }
  pipeline.hset("servers:by_token_hash", token_hash, String(id));
  await pipeline.exec();

  return token;
}

/**
 * Record a successful authenticated request from an agent.
 * Updates last_seen, last_ip, registered_ip (on first contact), and
 * detects/clears ip_mismatch and token_reused flags.
 */
export async function touchServer(id: number, ip?: string): Promise<void> {
  const r = getRedis();
  const server = await getServerById(id);
  if (!server) return;

  const timestamp = new Date().toISOString();
  const updates: Record<string, string> = { last_seen: timestamp };

  if (ip) {
    let registeredIp = server.registered_ip;
    if (!registeredIp) {
      // First successful connection — lock in the IP
      registeredIp = ip;
      updates.registered_ip = ip;
    }

    updates.last_ip = ip;

    // Track all source IPs this token has been used from
    await r.sadd(`server:id:${id}:ips`, ip);
    const uniqueIpsCount = await r.scard(`server:id:${id}:ips`);

    if (uniqueIpsCount > 1) {
      updates.token_reused = "1";
      await pushAudit({
        action: "token_reuse_detected",
        ip,
        server: server.name,
        timestamp,
        actor: "system",
      });
    }

    if (ip !== registeredIp) {
      updates.ip_mismatch = "1";
      await pushAudit({
        action: "server_ip_changed",
        ip,
        server: server.name,
        timestamp,
        actor: "system",
      });
    } else {
      // IP matches — clear any previous mismatch flag
      updates.ip_mismatch = "0";
    }
  }

  await r.hset(`server:id:${id}`, updates);
}

/**
 * Record a failed auth attempt where the token was recognised but the
 * source IP doesn't match the server's registered IP.
 * Does NOT update last_seen or last_ip — this is a rejected request.
 */
export async function recordIpMismatchRejection(
  server: ServerRecord,
  ip: string,
  url: string,
  token: string
): Promise<void> {
  const timestamp = new Date().toISOString();

  // Audit log the rejection
  await pushAudit({
    action: "auth_rejected_ip_mismatch",
    ip,
    server: server.name,
    timestamp,
    actor: "system",
  });

  // Push to failed_auth log with full context
  await pushFailedAuth({
    ip,
    token,
    url,
    timestamp,
    reason: "ip_mismatch",
    server: server.name,
  });
}

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
  
  // Save filter options to Redis Sets for fast access
  await r.sadd("jails", ban.jail);
  await r.sadd("servers", ban.server);
  if (ban.country) await r.sadd("countries", ban.country);
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
  const keysList: string[] = [];
  let cursor = "0";
  do {
    const [next, foundKeys] = await r.scan(cursor, "MATCH", "ban:*", "COUNT", 1000);
    cursor = next;
    keysList.push(...foundKeys);
  } while (cursor !== "0");

  if (keysList.length === 0) return [];

  const pipeline = r.pipeline();
  for (const key of keysList) {
    pipeline.hgetall(key);
  }
  const results = await pipeline.exec();

  const bans: BanRecord[] = [];
  for (const result of results || []) {
    const [err, data] = result as [Error | null, Record<string, string>];
    if (!err && data && data.ip) {
      bans.push({ ...data, bantime: Number(data.bantime) || 0 } as BanRecord);
    }
  }
  return bans;
}

export async function getFilterOptions(): Promise<{ jails: string[]; servers: string[]; countries: string[] }> {
  const r = getRedis();
  const [jails, servers, countries] = await Promise.all([
    r.smembers("jails"),
    r.smembers("servers"),
    r.smembers("countries"),
  ]);
  return {
    jails: jails.sort(),
    servers: servers.sort(),
    countries: countries.sort(),
  };
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

export async function getAuditLog(limit = 300): Promise<AuditEntry[]> {
  const raw = await getRedis().lrange(keys.audit(), 0, limit - 1);
  return raw.map((s) => JSON.parse(s));
}

// ── Failed Auth Log ──

export interface FailedAuthEntry {
  /** Source IP of the requester */
  ip: string;
  /** Full x-api-key token submitted (or "<none>" if header was absent) */
  token: string;
  /** Full request URL including FQDN (e.g. https://f2b.example.com/api/ban) */
  url: string;
  timestamp: string;
  /**
   * Why authentication failed:
   *  - "no_token"      — no x-api-key header was sent
   *  - "token_mismatch" — token not found in the registry
   *  - "ip_mismatch"   — token is valid but the source IP differs from the registered IP
   */
  reason?: "no_token" | "token_mismatch" | "ip_mismatch";
  /** Server name, only present for ip_mismatch (token was recognised) */
  server?: string;
}

export async function pushFailedAuth(entry: FailedAuthEntry): Promise<void> {
  const r = getRedis();
  await r.lpush("failed_auth", JSON.stringify(entry));
  await r.ltrim("failed_auth", 0, 199); // cap at 200
}

export async function getFailedAuths(limit = 100): Promise<FailedAuthEntry[]> {
  const raw = await getRedis().lrange("failed_auth", 0, limit - 1);
  return raw.map((s) => JSON.parse(s) as FailedAuthEntry);
}

export async function deleteFailedAuth(timestamp: string): Promise<void> {
  const r = getRedis();
  const raw = await r.lrange("failed_auth", 0, -1);
  for (const item of raw) {
    const entry = JSON.parse(item) as FailedAuthEntry;
    if (entry.timestamp === timestamp) {
      // LREM count=0 removes all matching elements
      await r.lrem("failed_auth", 0, item);
      break;
    }
  }
}

// ── Pub/Sub ──

export async function publishEvent(channel: string, payload: Record<string, unknown>): Promise<void> {
  await getRedis().publish(channel, JSON.stringify(payload));
}
