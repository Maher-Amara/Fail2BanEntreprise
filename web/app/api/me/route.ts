import { getSessionFromCookies } from "@/lib/auth";
import { getClientIP, lookupIP } from "@/lib/geoip";

export async function GET(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIP(request);
  const geo = await lookupIP(ip);

  return Response.json({
    username: session.sub,
    role: session.role,
    ip,
    country: geo.country,
    country_code: geo.country_code,
    city: geo.city,
  });
}
