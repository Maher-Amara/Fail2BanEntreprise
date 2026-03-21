import { buildLogoutCookie } from "@/lib/auth";

export async function POST() {
  const response = Response.json({ status: "ok" });
  response.headers.set("Set-Cookie", buildLogoutCookie());
  return response;
}
