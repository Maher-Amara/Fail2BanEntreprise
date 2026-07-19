import { verifyApiKey, extractApiKey, extractClientIp } from "@/lib/auth";
import { getAllBans, getWhitelist, getTempWhitelist, pushFailedAuth } from "@/lib/redis";

export async function GET(request: Request) {
  const server = await verifyApiKey(request);
  if (!server) {
    await pushFailedAuth({
      ip: extractClientIp(request),
      token: extractApiKey(request) ?? "<none>",
      url: request.url,
      timestamp: new Date().toISOString(),
    });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

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
