import { getSessionFromCookies } from "@/lib/auth";
import { rotateServerToken } from "@/lib/redis";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Invalid server id" }, { status: 400 });
  }

  const token = await rotateServerToken(id);
  if (!token) return Response.json({ error: "Server not found" }, { status: 404 });

  return Response.json({
    token,
    message: "Token rotated. Save the new token — it will not be shown again.",
  });
}

