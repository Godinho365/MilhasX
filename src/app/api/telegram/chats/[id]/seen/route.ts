import { route, json, parseBody, requireUser } from "@/server/http";
import { telegramSeenSchema } from "@/server/schemas";
import { markGroupSeen } from "@/server/services/telegram";

// Grupo visto no app até a mensagem upTo
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, telegramSeenSchema);
  await markGroupSeen(u.id, (await params).id!, b.upTo);
  return json({ ok: true });
});
