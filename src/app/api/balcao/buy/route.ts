import { route, json, requireUser } from "@/server/http";
import { balcaoBuyRules } from "@/server/services/balcao";

// Balcão MilhasX, quem compra: as regras do formulário (limite, taxa, Viajante) e a média semanal do programa
export const GET = route(async (req) => {
  const u = await requireUser(req);
  const program = new URL(req.url).searchParams.get("programa");
  return json({ ok: true, item: await balcaoBuyRules(u.id, program) });
});
