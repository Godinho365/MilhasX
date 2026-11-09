import { route, json, parseBody, requireUser } from "@/server/http";
import { telegramSeenSchema } from "@/server/schemas";
import { markDmSeen } from "@/server/services/telegram";

// Conversa no privado vista no app até a mensagem upTo
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, telegramSeenSchema);
  await markDmSeen(u.id, (await params).id!, b.upTo);
  return json({ ok: true });
});
