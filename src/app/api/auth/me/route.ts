import { route, json, requireUser } from "@/server/http";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});
