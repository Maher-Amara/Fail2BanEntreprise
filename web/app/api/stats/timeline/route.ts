import { getSessionFromCookies } from "@/lib/auth";
import { getAuditLog } from "@/lib/redis";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const audit = await getAuditLog(500);

  // Aggregate bans by date (last 30 days)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 29);

  const counts: Record<string, number> = {};
  for (let i = 0; i < 30; i++) {
    const d = new Date(cutoff);
    d.setDate(d.getDate() + i);
    counts[d.toISOString().split("T")[0]] = 0;
  }

  for (const entry of audit) {
    if (entry.action !== "ban") continue;
    const day = entry.timestamp.split("T")[0];
    if (day in counts) counts[day]++;
  }

  const timeline = Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  return Response.json({ timeline });
}
