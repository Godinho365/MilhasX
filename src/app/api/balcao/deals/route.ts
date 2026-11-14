import { route, json, requireUser } from "@/server/http";
import { balcaoDeals } from "@/server/services/balcao";

// Balcão MilhasX: minhas negociações (como comprador e como vendedor); ?todas=1 inclui as encerradas
export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await balcaoDeals(u.id, new URL(req.url).searchParams.get("todas") === "1") });
});
