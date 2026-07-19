import { verifyApiKeyFull, extractApiKey, extractClientIp } from "@/lib/auth";
import { getAllBans, getWhitelist, getTempWhitelist, pushFailedAuth } from "@/lib/redis";

export async function GET(request: Request) {
  const { server, reason: authReason } = await verifyApiKeyFull(request);
  if (!server) {
    // ip_mismatch is already logged by recordIpMismatchRejection inside verifyApiKeyFull
    if (authReason !== "ip_mismatch") {
      await pushFailedAuth({
        ip: extractClientIp(request),
        token: extractApiKey(request) ?? "<none>",
        url: request.url,
        timestamp: new Date().toISOString(),
        reason: authReason ?? "token_mismatch",
      });
    }
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
