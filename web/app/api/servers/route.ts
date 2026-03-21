import { getSessionFromCookies } from "@/lib/auth";
import { createServer, getAllServers, deleteServer } from "@/lib/db";
import { createServerSchema, parseBody } from "@/lib/validation";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const servers = getAllServers();
  return Response.json({ servers });
}

export async function POST(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = parseBody(createServerSchema, body);
  if (!parsed.success) return Response.json({ error: parsed.error }, { status: 400 });

  const { server, token } = createServer(parsed.data.name, session.uid);

  return Response.json({
    server,
    token, // ← shown only once; store it securely
    message: "Save this token — it will not be shown again.",
  }, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await request.json() as { id?: number };
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const ok = deleteServer(id);
  return Response.json({ status: ok ? "deleted" : "not_found" });
}
