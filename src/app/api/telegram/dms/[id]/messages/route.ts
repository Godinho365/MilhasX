import { route, json, parseBody, requireUser } from "@/server/http";
import { telegramSendSchema } from "@/server/schemas";
import { dmMessages, sendTelegramDm } from "@/server/services/telegram";

// Mensagens da conversa no privado (?minId= só as novas; ?ids=1,2 só essas); POST manda uma mensagem (escrita pelo usuário)
export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  const q = new URL(req.url).searchParams;
  const ids = q.get("ids")?.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 50); // relê estas (editadas)
  const { items, readMax } = await dmMessages(u.id, (await params).id!, { minId: Number(q.get("minId")) || undefined, limit: Number(q.get("limit")) || undefined, ids: ids?.length ? ids : undefined });
  return json({ ok: true, items, readMax });
});

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, telegramSendSchema);
  return json({ ok: true, item: await sendTelegramDm(u.id, (await params).id!, b.text, b.replyTo) }, 201);
});
