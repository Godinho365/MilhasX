import { z } from "zod";
import { route, json, parseBody, requireUser } from "@/server/http";
import { revokeAccess, updateAccess } from "@/server/services/team-access";
import { ROLE_KEYS } from "@/domain/permissions";

const schema = z.object({
  role: z.enum(ROLE_KEYS),
  permissions: z.array(z.string().max(40)).max(60).optional(),
});

// Muda a função/permissões do membro (vale na hora) ou tira o acesso dele (DELETE)
export const PATCH = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, schema);
  await updateAccess(u.id, (await params).id!, b, { actorId: u.actor.id, actorMemberId: u.actor.memberId });
  return json({ ok: true });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await revokeAccess(u.id, (await params).id!, { actorId: u.actor.id, actorMemberId: u.actor.memberId });
  return json({ ok: true });
});
