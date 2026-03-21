import { getSessionFromCookies } from "@/lib/auth";
import { getAllBans, getWhitelist, getTempWhitelist, getAuditLog } from "@/lib/redis";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [bans, whitelist, tempWhitelist, audit] = await Promise.all([
    getAllBans(),
    getWhitelist(),
    getTempWhitelist(),
    getAuditLog(50),
  ]);

  // Aggregate stats
  const jailCounts: Record<string, number> = {};
  const countryCounts: Record<string, number> = {};
  const serverCounts: Record<string, number> = {};

  for (const ban of bans) {
    jailCounts[ban.jail] = (jailCounts[ban.jail] || 0) + 1;
    if (ban.country) {
      countryCounts[ban.country] = (countryCounts[ban.country] || 0) + 1;
    }
    serverCounts[ban.server] = (serverCounts[ban.server] || 0) + 1;
  }

  // Today's events from audit
  const today = new Date().toISOString().split("T")[0];
  const eventsToday = audit.filter((e) => e.timestamp.startsWith(today)).length;

  return Response.json({
    stats: {
      totalBans: bans.length,
      whitelistedIPs: whitelist.length + tempWhitelist.length,
      eventsToday,
      topJail:
        Object.entries(jailCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || "none",
    },
    bans,
    jailDistribution: jailCounts,
    countryDistribution: countryCounts,
    serverDistribution: serverCounts,
    recentEvents: audit,
  });
}
