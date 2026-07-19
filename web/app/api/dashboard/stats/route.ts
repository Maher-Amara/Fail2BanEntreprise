import { getSessionFromCookies } from "@/lib/auth";
import { getAllBans, getWhitelist, getTempWhitelist, getAuditLog, getFilterOptions } from "@/lib/redis";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [bans, whitelist, tempWhitelist, audit, filters] = await Promise.all([
    getAllBans(),
    getWhitelist(),
    getTempWhitelist(),
    getAuditLog(300),
    getFilterOptions(),
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

  // Build filter dropdown choices (combine active distributions and stored set values)
  const allJails = Array.from(new Set([...Object.keys(jailCounts), ...filters.jails])).sort();
  const allServers = Array.from(new Set([...Object.keys(serverCounts), ...filters.servers])).sort();
  const allCountries = Array.from(new Set([...Object.keys(countryCounts), ...filters.countries])).sort();

  // Recent bans for the quick attacker view
  const recentBans = [...bans]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 8);

  return Response.json({
    stats: {
      totalBans: bans.length,
      whitelistedIPs: whitelist.length + tempWhitelist.length,
      eventsToday,
      topJail:
        Object.entries(jailCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || "none",
    },
    jailDistribution: jailCounts,
    countryDistribution: countryCounts,
    serverDistribution: serverCounts,
    recentEvents: audit,
    recentBans,
    filters: {
      jails: allJails,
      servers: allServers,
      countries: allCountries,
    },
  });
}
