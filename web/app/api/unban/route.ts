import { getSessionFromCookies } from "@/lib/auth";
import { removeBan, publishEvent, pushAudit } from "@/lib/redis";
import { unbanSchema, parseBody } from "@/lib/validation";

// /api/unban requires JWT — only dashboard admins can unban.
// Agents rely on Redis TTL for automatic expiry.

export async function POST(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = parseBody(unbanSchema, body);
  if (!parsed.success) return Response.json({ error: parsed.error }, { status: 400 });

  const { ip, jail } = parsed.data;
  const now = new Date().toISOString();

  await removeBan(ip);
  await publishEvent("f2b:unban", { action: "unban", ip, jail: jail || "manual", server: "dashboard", timestamp: now });
  await pushAudit({ action: "unban", ip, jail: jail || "manual", server: "dashboard", actor: session.sub, timestamp: now });

  return Response.json({ status: "unbanned", ip });
}
