import { verifyApiKey } from "@/lib/auth";
import { getAllBans, getWhitelist, getTempWhitelist } from "@/lib/redis";

export async function GET(request: Request) {
  const server = await verifyApiKey(request);
  if (!server) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [bans, whitelist, tempWhitelist] = await Promise.all([
    getAllBans(),
    getWhitelist(),
    getTempWhitelist(),
  ]);

  return Response.json({
    server: server.name,
    bans,
    whitelist: [...new Set([...whitelist, ...tempWhitelist])],
    timestamp: new Date().toISOString(),
  });
}
