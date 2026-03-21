import { checkCredentials, createJwt, buildSessionCookie } from "@/lib/auth";
import { loginSchema, parseBody } from "@/lib/validation";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseBody(loginSchema, body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const { username, password } = parsed.data;

  const user = await checkCredentials(username, password);
  if (!user) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await createJwt(user);

  const response = Response.json({ status: "ok", username: user.username });
  response.headers.set("Set-Cookie", buildSessionCookie(token));

  return response;
}
