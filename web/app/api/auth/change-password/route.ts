import { getSessionFromCookies } from "@/lib/auth";
import { getUserByUsername, updatePassword, verifyPassword } from "@/lib/db";
import { changePasswordSchema, parseBody } from "@/lib/validation";

export async function POST(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = parseBody(changePasswordSchema, body);
  if (!parsed.success) return Response.json({ error: parsed.error }, { status: 400 });

  const { currentPassword, newPassword } = parsed.data;

  // Verify current password
  const row = getUserByUsername(session.sub);
  if (!row) return Response.json({ error: "User not found" }, { status: 404 });

  const valid = await verifyPassword(currentPassword, row.password);
  if (!valid) return Response.json({ error: "Current password is incorrect" }, { status: 401 });

  await updatePassword(session.uid, newPassword);
  return Response.json({ status: "ok" });
}
