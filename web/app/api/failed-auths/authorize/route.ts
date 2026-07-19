import { getSessionFromCookies, getAllowedOrigins } from "@/lib/auth";
import { getFailedAuths, deleteFailedAuth, createServerWithToken } from "@/lib/redis";

export async function POST(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { timestamp?: string; name?: string };
  const { timestamp, name } = body;

  if (!timestamp || !name?.trim()) {
    return Response.json({ error: "Missing timestamp or name" }, { status: 400 });
  }

  // Find the matching failed-auth entry
  const attempts = await getFailedAuths(200);
  const entry = attempts.find((a) => a.timestamp === timestamp);

  if (!entry) {
    return Response.json(
      { error: "Attempt not found (may have been dismissed)" },
      { status: 404 }
    );
  }

  if (entry.token === "<none>") {
    return Response.json(
      { error: "Cannot authorize: no token was submitted in this request" },
      { status: 422 }
    );
  }

  if (!entry.ip || entry.ip === "unknown") {
    return Response.json(
      { error: "Cannot authorize: source IP is unknown" },
      { status: 422 }
    );
  }

  // Validate that the FQDN from the failed attempt is in the allowed origins
  const fqdn = entry.fqdn;
  if (!fqdn) {
    return Response.json(
      { error: "Cannot authorize: no FQDN recorded for this attempt" },
      { status: 422 }
    );
  }

  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.length > 0 && !allowedOrigins.includes(fqdn)) {
    return Response.json(
      { error: `The FQDN "${fqdn}" recorded in this attempt is not in the allowed origins list` },
      { status: 422 }
    );
  }

  let server;
  try {
    server = await createServerWithToken(name.trim(), entry.token, session.uid, {
      registeredIp: entry.ip,
      registeredDomain: fqdn,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE constraint failed")) {
      return Response.json(
        { error: "A server with that name or token already exists" },
        { status: 409 }
      );
    }
    throw err;
  }

  // Dismiss the entry from the failed-auth log once authorized
  await deleteFailedAuth(timestamp);

  return Response.json({
    server,
    // Return the token so the UI can show the "copy token" banner
    // The agent already has this token — no reconfiguration needed
    token: entry.token,
    message: "Server authorized. The agent's existing token is now active.",
  }, { status: 201 });
}
