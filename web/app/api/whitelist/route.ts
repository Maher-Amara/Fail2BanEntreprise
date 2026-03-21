import { getSessionFromCookies } from "@/lib/auth";
import {
  getWhitelist,
  getTempWhitelist,
  addToWhitelist,
  removeFromWhitelist,
  pushAudit,
} from "@/lib/redis";
import { whitelistSchema, parseBody } from "@/lib/validation";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [permanent, temporary] = await Promise.all([getWhitelist(), getTempWhitelist()]);

  return Response.json({
    permanent,
    temporary,
  });
}

export async function POST(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseBody(whitelistSchema, body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const { ip, action: act } = parsed.data;

  if (act === "remove") {
    await removeFromWhitelist(ip);
    await pushAudit({
      action: "whitelist-remove",
      ip,
      actor: session.sub,
      timestamp: new Date().toISOString(),
    });
    return Response.json({ status: "removed", ip });
  }

  await addToWhitelist(ip);
  await pushAudit({
    action: "whitelist-add",
    ip,
    actor: session.sub,
    timestamp: new Date().toISOString(),
  });

  return Response.json({ status: "added", ip });
}
