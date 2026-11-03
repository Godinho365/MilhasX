import { route, json, parseBody, requireUser } from "@/server/http";
import { interestSchema } from "@/server/schemas";
import { listInterests, saveInterest } from "@/server/services/contacts";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const sp = new URL(req.url).searchParams;
  return json({ ok: true, items: await listInterests(u.id, { status: sp.get("status") || undefined, priority: sp.get("prioridade") || undefined, month: sp.get("mes") || undefined }) });
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, interestSchema);
  return json({ ok: true, id: await saveInterest(u.id, null, b) }, 201);
});
