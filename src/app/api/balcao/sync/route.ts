import { route, json, requireUser } from "@/server/http";
import { syncBalcao } from "@/server/services/balcao";

// Balcão MilhasX: traz o que mudou no Balcão e anda com as negociações do CRM Milhas (a página chama ao abrir e a
// cada minuto enquanto está aberta)
export const POST = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await syncBalcao(u.id) });
});
