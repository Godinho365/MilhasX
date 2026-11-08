import { route, json, parseBody, requireUser } from "@/server/http";
import { finTxSchema } from "@/server/schemas";
import { createFinTx, listFinTx } from "@/server/services/finance";
import { brDay } from "@/domain/brasilia";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const sp = new URL(req.url).searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.get("mes") ?? "") ? sp.get("mes")! : brDay().slice(0, 7);
  const status = sp.get("status") === "pago" ? "pago" : sp.get("status") === "pendente" ? "pendente" : undefined;
  return json({ ok: true, items: await listFinTx(u.id, month, sp.get("regime") === "competencia" ? "competencia" : "caixa", { type: sp.get("tipo") ?? undefined, status, accountId: sp.get("conta") ?? undefined }) });
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, finTxSchema);
  return json({ ok: true, created: await createFinTx(u.id, b) }, 201);
});
