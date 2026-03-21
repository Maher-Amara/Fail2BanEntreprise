import { needsSetup, createUser } from "@/lib/db";
import { createJwt, buildSessionCookie } from "@/lib/auth";
import { setupSchema, parseBody } from "@/lib/validation";

export async function GET() {
  return Response.json({ needsSetup: needsSetup() });
}

export async function POST(request: Request) {
  // Only allow setup if no users exist
  if (!needsSetup()) {
    return Response.json({ error: "Setup already completed" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseBody(setupSchema, body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const { username, password } = parsed.data;

  const user = await createUser(username, password, "admin");

  const token = await createJwt(user);
  const response = Response.json({ status: "ok", username: user.username });
  response.headers.set("Set-Cookie", buildSessionCookie(token));

  return response;
}
