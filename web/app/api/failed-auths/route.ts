import { getSessionFromCookies } from "@/lib/auth";
import { getFailedAuths, deleteFailedAuth } from "@/lib/redis";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const attempts = await getFailedAuths(100);
  return Response.json({ attempts });
}

export async function DELETE(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { timestamp } = await request.json() as { timestamp?: string };
  if (!timestamp) return Response.json({ error: "Missing timestamp" }, { status: 400 });

  await deleteFailedAuth(timestamp);
  return Response.json({ status: "dismissed" });
}
