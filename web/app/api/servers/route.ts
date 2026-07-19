import { getSessionFromCookies, getAllowedOrigins } from "@/lib/auth";
import { createServer, getAllServers, deleteServer } from "@/lib/redis";
import { createServerSchema, parseBody } from "@/lib/validation";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const servers = await getAllServers();
  return Response.json({ servers });
}

export async function POST(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = parseBody(createServerSchema, body);
  if (!parsed.success) return Response.json({ error: parsed.error }, { status: 400 });

  const { name, ip, domain } = parsed.data;

  // Validate domain is in the allowed origins list
  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.length > 0 && !allowedOrigins.includes(domain)) {
    return Response.json(
      { error: `Domain "${domain}" is not in the allowed origins list` },
      { status: 400 }
    );
  }

  let server, token;
  try {
    const res = await createServer(name, session.uid, {
      registeredIp: ip,
      registeredDomain: domain,
    });
    server = res.server;
    token = res.token;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE constraint failed")) {
      return Response.json({ error: "A server with that name already exists" }, { status: 409 });
    }
    throw err;
  }

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

  const ok = await deleteServer(id);
  return Response.json({ status: ok ? "deleted" : "not_found" });
}
