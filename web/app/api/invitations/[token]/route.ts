import { getInvitationByToken, isInvitationValid, createUser, markInvitationUsed, getUserByUsername } from "@/lib/db";
import { createJwt, buildSessionCookie } from "@/lib/auth";
import { acceptInviteSchema, parseBody } from "@/lib/validation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const inv = getInvitationByToken(token);
  if (!inv || !isInvitationValid(inv)) {
    return Response.json({ valid: false, reason: "Invitation is invalid or expired" });
  }
  return Response.json({ valid: true, expires_at: inv.expires_at });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const inv = getInvitationByToken(token);
  if (!inv || !isInvitationValid(inv)) {
    return Response.json({ error: "Invitation is invalid or expired" }, { status: 400 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = parseBody(acceptInviteSchema, body);
  if (!parsed.success) return Response.json({ error: parsed.error }, { status: 400 });

  const { username, password } = parsed.data;

  if (getUserByUsername(username)) {
    return Response.json({ error: "Username already taken" }, { status: 409 });
  }

  const user = await createUser(username, password, "admin");
  markInvitationUsed(inv.id, user.id);

  const jwtToken = await createJwt(user);
  const response = Response.json({ status: "ok", username: user.username });
  response.headers.set("Set-Cookie", buildSessionCookie(jwtToken));
  return response;
}
