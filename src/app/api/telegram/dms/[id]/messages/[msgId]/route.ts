import { route, json, parseBody, requireUser } from "@/server/http";
import { DomainError } from "@/server/db";
import { telegramEditSchema } from "@/server/schemas";
import { changeDmMessage } from "@/server/services/telegram";

const msgId = (raw: string | undefined) => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new DomainError(400, "Mensagem inválida");
  return n;
};

// Edita (PATCH) ou exclui (DELETE) uma mensagem sua na conversa no privado
export const PATCH = route(async (req, { params }) => {
  const u = await requireUser(req);
  const p = await params;
  const b = await parseBody(req, telegramEditSchema);
  return json({ ok: true, item: await changeDmMessage(u.id, p.id!, msgId(p.msgId), b.text) });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  const p = await params;
  await changeDmMessage(u.id, p.id!, msgId(p.msgId), null);
  return json({ ok: true });
});
