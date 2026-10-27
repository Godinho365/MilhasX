import { route, json, parseBody, requireUser } from "@/server/http";
import { holderDetailsSchema } from "@/server/schemas";
import { saveHolder, deleteHolder } from "@/server/services/wallet";

// PATCH aceita o cadastro parcial: só o nome continua obrigatório
export const PATCH = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, holderDetailsSchema);
  return json({ ok: true, item: await saveHolder(u.id, (await params).id!, b) });
});
export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteHolder(u.id, (await params).id!);
  return json({ ok: true });
});
