import { getSessionFromCookies } from "@/lib/auth";
import { rotateServerToken } from "@/lib/db";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const token = rotateServerToken(Number(id));
  if (!token) return Response.json({ error: "Server not found" }, { status: 404 });

  return Response.json({
    token,
    message: "Token rotated. Save the new token — it will not be shown again.",
  });
}
