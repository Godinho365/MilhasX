import { z } from "zod";
import { route, json, parseBody, requireUser } from "@/server/http";
import { startCheckout } from "@/server/services/billing-mp";

const schema = z.object({
  plan: z.enum(["PRO", "GESTOR"]),
  interval: z.enum(["MENSAL", "ANUAL"]),
  payerEmail: z.string().trim().email("E-mail inválido").max(200),
});

// Cria a assinatura no Mercado Pago e devolve o link de pagamento
export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, schema);
  return json({ ok: true, ...(await startCheckout(u.id, b.plan, b.interval, b.payerEmail)) }, 201);
});
