import { getSessionFromCookies } from "@/lib/auth";
import { createInvitation, getAllInvitations, revokeInvitation } from "@/lib/db";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const invitations = getAllInvitations();
  return Response.json({ invitations });
}

export async function POST() {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const inv = createInvitation(session.uid, 72); // 72h validity
  const base = process.env.NEXT_PUBLIC_BASE_URL || "";
  const link = `${base}/invite/${inv.token}`;

  return Response.json({ invitation: inv, link }, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await request.json() as { id?: number };
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const ok = revokeInvitation(id);
  return Response.json({ status: ok ? "revoked" : "not_found" });
}
