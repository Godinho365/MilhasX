import { z } from "zod";
import { route, json, parseBody, requireUser } from "@/server/http";
import { inviteMember } from "@/server/services/team-access";

const schema = z.object({
  role: z.enum(["ADMIN", "EMISSOR", "ATENDIMENTO", "FINANCEIRO", "CONTADOR", "CUSTOM"]),
  permissions: z.array(z.string().max(40)).max(60).optional(),
  email: z.string().trim().email("E-mail inválido").max(200).nullable().optional(),
});

// Convida o membro para entrar com login próprio (devolve o link de uso único para mandar a ele)
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, schema);
  const appUrl = process.env.APP_URL || new URL(req.url).origin;
  return json({ ok: true, item: await inviteMember(u.id, (await params).id!, b, { actorId: u.actor.id, actorMemberId: u.actor.memberId, appUrl, agencyName: u.name }) }, 201);
});
