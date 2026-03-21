import { removeBan, getBan, addTempWhitelist, publishEvent, pushAudit } from "@/lib/redis";
import { getClientIP, lookupIP } from "@/lib/geoip";
import { getSessionFromCookies } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIP(request);
  const ban = await getBan(ip);
  const geo = await lookupIP(ip);

  return Response.json({
    ip,
    banned: !!ban,
    ban: ban || null,
    country: geo.country,
    city: geo.city,
  });
}

export async function POST(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIP(request);
  const ban = await getBan(ip);

  if (ban) {
    await removeBan(ip);
  }

  await addTempWhitelist(ip, 86400);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 86400 * 1000);

  await publishEvent("f2b:unban", {
    action: "unban-me",
    ip,
    jail: ban?.jail || "none",
    server: "self-service",
    timestamp: now.toISOString(),
  });

  await pushAudit({
    action: "unban-me",
    ip,
    jail: ban?.jail,
    actor: session.sub,
    timestamp: now.toISOString(),
  });

  return Response.json({
    status: "ok",
    ip,
    was_banned: !!ban,
    whitelisted_until: expiresAt.toISOString(),
    message: `IP ${ip} unbanned and whitelisted for 24 hours`,
  });
}
