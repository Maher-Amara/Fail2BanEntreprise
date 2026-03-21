import { getSessionFromCookies } from "@/lib/auth";
import { getAllUsers } from "@/lib/db";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const users = getAllUsers();
  return Response.json({ users });
}
