import { getSessionFromCookies, getAllowedOrigins } from "@/lib/auth";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const origins = getAllowedOrigins();
  return Response.json({ origins });
}
