import { z } from "zod";
import { route, json, parseBody, requireUser } from "@/server/http";
import { quoteCoupon } from "@/server/services/promo";
import { planPriceCents } from "@/domain/plans";
import { DomainError } from "@/server/db";

const schema = z.object({ code: z.string().trim().min(1, "Informe o cupom").max(40), plan: z.enum(["PRO", "GESTOR"]), interval: z.enum(["MENSAL", "ANUAL"]) });

// Prévia do cupom na tela de assinatura: devolve o desconto por cobrança e o valor final
export const POST = route(async (req) => {
  await requireUser(req);
  const b = await parseBody(req, schema);
  const months = b.interval === "ANUAL" ? 12 : 1;
  const base = planPriceCents(b.plan, b.interval) * months;
  const { check } = await quoteCoupon(b.code, b.plan, b.interval, base);
  if (!check.ok) throw new DomainError(400, check.error);
  return json({ ok: true, label: check.label, discountCents: check.discountCents, finalCents: check.finalCents, baseCents: base });
});
