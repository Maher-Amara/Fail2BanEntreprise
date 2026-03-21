import { verifyApiKey, getSessionFromCookies } from "@/lib/auth";
import { addBan, isWhitelisted, publishEvent, pushAudit } from "@/lib/redis";
import { lookupIP } from "@/lib/geoip";
import { checkIP, intelEnabled } from "@/lib/intel";
import { banSchema, parseBody } from "@/lib/validation";

export async function POST(request: Request) {
  // Accept either a per-server API key (agent) OR a JWT cookie (dashboard manual ban)
  const server = await verifyApiKey(request);
  const session = server ? null : await getSessionFromCookies();
  if (!server && !session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = parseBody(banSchema, body);
  if (!parsed.success) return Response.json({ error: parsed.error }, { status: 400 });

  const { ip, jail, bantime } = parsed.data;
  // Server name: from the DB record (agent) or from body (dashboard manual)
  const serverName = server ? server.name : (parsed.data.server || "dashboard");

  if (await isWhitelisted(ip)) {
    return Response.json({ status: "skipped", reason: "IP is whitelisted", ip });
  }

  const [geo, intel] = await Promise.all([
    lookupIP(ip),
    intelEnabled() ? checkIP(ip) : Promise.resolve(null),
  ]);

  const ban = {
    ip,
    jail,
    server: serverName,
    timestamp: new Date().toISOString(),
    bantime: bantime || 86400,
    country: geo.country,
    city: geo.city,
    lat: geo.lat?.toString(),
    lon: geo.lon?.toString(),
  };

  await addBan(ban);
  await publishEvent("f2b:ban", { action: "ban", ...ban, intel: intel?.totalScore });
  await pushAudit({
    action: "ban",
    ip,
    jail,
    server: serverName,
    actor: session?.sub,
    timestamp: ban.timestamp,
  });

  return Response.json({ status: "banned", ban, intel });
}
