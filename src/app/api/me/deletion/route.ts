import { route, json, requireUser } from "@/server/http";
import { requestDeletion, cancelDeletion } from "@/server/services/settings";

export const POST = route(async (req) => {
  const u = await requireUser(req);
  await requestDeletion(u.id);
  return json({ ok: true });
});

export const DELETE = route(async (req) => {
  const u = await requireUser(req);
  await cancelDeletion(u.id);
  return json({ ok: true });
});
