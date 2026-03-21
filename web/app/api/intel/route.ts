import { getSessionFromCookies } from "@/lib/auth";
import { checkIP, intelEnabled } from "@/lib/intel";
import { geoipQuerySchema, parseBody } from "@/lib/validation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const ip = request.nextUrl.searchParams.get("ip");
  const parsed = parseBody(geoipQuerySchema, { ip });
  if (!parsed.success) return Response.json({ error: parsed.error }, { status: 400 });

  if (!intelEnabled()) {
    return Response.json({ enabled: false, message: "No intel API keys configured" });
  }

  const result = await checkIP(parsed.data.ip);
  return Response.json({ enabled: true, ip: parsed.data.ip, ...result });
}
