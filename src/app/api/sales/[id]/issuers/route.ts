import { route, json, parseBody, requireUser } from "@/server/http";
import { saleIssuersSchema } from "@/server/schemas";
import { setSaleIssuers } from "@/server/services/sales";

// Emissores da venda (membros da Equipe): base da aba Equipe em Métricas
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, saleIssuersSchema);
  return json({ ok: true, item: await setSaleIssuers(u.id, (await params).id!, b.memberIds) });
});
