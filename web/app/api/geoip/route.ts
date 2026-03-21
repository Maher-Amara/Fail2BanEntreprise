import { type NextRequest } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { lookupIP } from "@/lib/geoip";
import { geoipQuerySchema, parseBody } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = request.nextUrl.searchParams.get("ip");

  const parsed = parseBody(geoipQuerySchema, { ip });
  if (!parsed.success) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const result = await lookupIP(parsed.data.ip);

  return Response.json({ ip: parsed.data.ip, ...result });
}
