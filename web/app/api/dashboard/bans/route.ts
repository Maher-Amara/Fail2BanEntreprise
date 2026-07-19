import { getSessionFromCookies } from "@/lib/auth";
import { getAllBans, getFilterOptions } from "@/lib/redis";

export async function GET(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.max(1, parseInt(searchParams.get("limit") || "100", 10));
  const search = searchParams.get("search")?.trim().toLowerCase() || "";
  const jailFilter = searchParams.get("jail") || "";
  const countryFilter = searchParams.get("country") || "";

  const [allBans, filters] = await Promise.all([
    getAllBans(),
    getFilterOptions(),
  ]);

  // Filter in memory
  let filtered = allBans;
  if (search || jailFilter || countryFilter) {
    filtered = allBans.filter((ban) => {
      if (search && !ban.ip.toLowerCase().includes(search) && !ban.server.toLowerCase().includes(search)) {
        return false;
      }
      if (jailFilter && ban.jail !== jailFilter) {
        return false;
      }
      if (countryFilter && ban.country !== countryFilter) {
        return false;
      }
      return true;
    });
  }

  // Sort by timestamp descending
  filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Slice
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const slicedBans = filtered.slice(startIndex, endIndex);
  const hasMore = endIndex < filtered.length;

  return Response.json({
    bans: slicedBans,
    hasMore,
    total: filtered.length,
    filters,
  });
}
