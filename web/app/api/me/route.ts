import { getSessionFromCookies, extractPublicUrl } from "@/lib/auth";
import { getClientIP, lookupIP } from "@/lib/geoip";

export async function GET(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIP(request);
  const geo = await lookupIP(ip);

  // Derive the public base URL from the full request URL (strips path)
  const fullUrl = extractPublicUrl(request);
  let publicBaseUrl: string;
  try {
    const u = new URL(fullUrl);
    publicBaseUrl = `${u.protocol}//${u.host}`;
  } catch {
    publicBaseUrl = fullUrl;
  }

  // Expose key Cloudflare / proxy headers for diagnostic display
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  const xForwardedHost = request.headers.get("x-forwarded-host");
  const xForwardedProto = request.headers.get("x-forwarded-proto");
  const cfVisitor = request.headers.get("cf-visitor");
  const host = request.headers.get("host");

  return Response.json({
    username: session.sub,
    role: session.role,
    ip,
    country: geo.country,
    country_code: geo.country_code,
    city: geo.city,
    /** The public-facing base URL as seen through Cloudflare Tunnel headers */
    publicBaseUrl,
    /** Raw header diagnostics — useful to verify Cloudflare is forwarding correctly */
    headers: {
      "cf-connecting-ip": cfConnectingIp,
      "x-forwarded-host": xForwardedHost,
      "x-forwarded-proto": xForwardedProto,
      "cf-visitor": cfVisitor,
      host,
    },
  });
}
