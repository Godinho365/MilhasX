import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import type { Plan } from "@prisma/client";
import { prisma, DomainError, audit, log } from "../db";
import { PLANS, planPriceCents, type PlanCode, type PlanInterval } from "@/domain/plans";

// Assinaturas pagas no Mercado Pago ("assinatura sem plano associado", pagamento pendente):
// o servidor cria um preapproval e manda o usuário para o link de pagamento do Mercado Pago.
// O plano só muda depois de consultar o preapproval na API com o token do servidor;
// o corpo do webhook nunca é usado como verdade.
const API = "https://api.mercadopago.com";

export const mpEnabled = () => !!process.env.MP_ACCESS_TOKEN;

type Preapproval = {
  id: string;
  status: string; // pending | authorized | paused | cancelled
  external_reference?: string | null;
  init_point?: string | null;
  auto_recurring?: { transaction_amount?: number; frequency?: number; frequency_type?: string };
};

async function mp<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new DomainError(503, "Pagamento online não configurado neste servidor");
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(init.method === "POST" ? { "x-idempotency-key": randomUUID() } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new DomainError(502, "Mercado Pago não respondeu. Tente de novo em instantes.");
  }
  if (!res.ok) {
    log("error", "billing.mp_error", { path: path.split("?")[0], status: res.status });
    throw new DomainError(502, "O Mercado Pago recusou a operação. Tente de novo ou fale com o suporte.");
  }
  return (await res.json()) as T;
}

const STATUS: Record<string, string> = { pending: "PENDING", authorized: "AUTHORIZED", paused: "PAUSED", cancelled: "CANCELLED" };

/** Cria a assinatura no Mercado Pago e devolve o link de pagamento. */
export async function startCheckout(userId: string, plan: PlanCode, interval: PlanInterval, payerEmail: string) {
  if (plan === "PESSOAL") throw new DomainError(400, "O plano Pessoal é gratuito");
  const base = process.env.APP_URL;
  if (!base) throw new DomainError(503, "APP_URL não configurada no servidor");
  const months = interval === "ANUAL" ? 12 : 1;
  const amountCents = planPriceCents(plan, interval) * months;
  const sub = await prisma.subscription.create({ data: { userId, plan, interval, amountCents } });
  const pre = await mp<Preapproval>("/preapproval", {
    method: "POST",
    body: {
      reason: `${process.env.APP_NAME || "Milheiro"} ${PLANS[plan].name} (${interval === "ANUAL" ? "anual" : "mensal"})`,
      external_reference: sub.id,
      payer_email: payerEmail,
      auto_recurring: { frequency: months, frequency_type: "months", transaction_amount: amountCents / 100, currency_id: "BRL" },
      back_url: `${new URL(base).origin}/app/settings?tab=billing`,
      status: "pending",
    },
  });
  if (!pre.init_point) throw new DomainError(502, "O Mercado Pago não devolveu o link de pagamento");
  await prisma.subscription.update({ where: { id: sub.id }, data: { externalId: pre.id, checkoutUrl: pre.init_point } });
  await audit(prisma, userId, "billing.checkout", "Subscription", sub.id, { plan, interval, amountCents });
  return { checkoutUrl: pre.init_point };
}

/**
 * Consulta o preapproval no Mercado Pago e aplica o resultado.
 * Com userId, só aceita assinatura desse usuário (volta do checkout); sem userId, vem do webhook.
 */
export async function syncSubscription(externalId: string, userId?: string) {
  const pre = await mp<Preapproval>(`/preapproval/${encodeURIComponent(externalId)}`);
  const sub = await prisma.subscription.findFirst({ where: { OR: [{ externalId: pre.id }, { id: pre.external_reference ?? "-" }] } });
  if (!sub || (userId && sub.userId !== userId)) throw new DomainError(404, "Assinatura não encontrada");
  // O valor cobrado precisa ser o que o servidor pediu
  const amount = Math.round((pre.auto_recurring?.transaction_amount ?? 0) * 100);
  if (amount !== sub.amountCents) {
    log("warn", "billing.amount_mismatch", { subscriptionId: sub.id });
    throw new DomainError(409, "Valor da assinatura diferente do esperado");
  }
  const status = STATUS[pre.status] ?? "PENDING";
  if (status === sub.status && sub.externalId === pre.id) return { status };
  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id: sub.id }, data: { status, externalId: pre.id } });
    if (status === "AUTHORIZED") {
      await tx.user.update({
        where: { id: sub.userId },
        data: { plan: sub.plan as Plan, planInterval: sub.interval, planRequest: null, planRequestInterval: null, planRequestedAt: null },
      });
      await tx.notification.create({ data: { userId: sub.userId, title: "Assinatura ativa", body: `Seu plano agora é ${PLANS[sub.plan as PlanCode].name}.` } });
    } else if (status === "CANCELLED" || status === "PAUSED") {
      // Só volta ao Pessoal se não houver outra assinatura ativa
      const other = await tx.subscription.count({ where: { userId: sub.userId, status: "AUTHORIZED", NOT: { id: sub.id } } });
      if (!other && sub.status === "AUTHORIZED") {
        await tx.user.update({ where: { id: sub.userId }, data: { plan: "PESSOAL", planInterval: null } });
        await tx.notification.create({ data: { userId: sub.userId, title: "Assinatura encerrada", body: "Sua conta voltou ao plano Pessoal." } });
      }
    }
    await audit(tx, null, "billing.sync", "Subscription", sub.id, { status });
  });
  // Assinou um plano novo: encerra a anterior para não cobrar duas vezes
  if (status === "AUTHORIZED") {
    const old = await prisma.subscription.findMany({ where: { userId: sub.userId, status: "AUTHORIZED", NOT: { id: sub.id }, externalId: { not: null } } });
    for (const o of old) {
      await mp(`/preapproval/${encodeURIComponent(o.externalId!)}`, { method: "PUT", body: { status: "cancelled" } }).catch(() => log("error", "billing.cancel_old_failed", { subscriptionId: o.id }));
      await prisma.subscription.update({ where: { id: o.id }, data: { status: "CANCELLED" } });
    }
  }
  return { status };
}

/** Cancela a assinatura ativa do usuário no Mercado Pago. */
export async function cancelSubscription(userId: string) {
  const sub = await prisma.subscription.findFirst({ where: { userId, status: "AUTHORIZED", externalId: { not: null } }, orderBy: { createdAt: "desc" } });
  if (!sub) throw new DomainError(404, "Nenhuma assinatura ativa");
  await mp(`/preapproval/${encodeURIComponent(sub.externalId!)}`, { method: "PUT", body: { status: "cancelled" } });
  await syncSubscription(sub.externalId!, userId);
  await audit(prisma, userId, "billing.cancel", "Subscription", sub.id);
}

export async function currentSubscription(userId: string) {
  const s = await prisma.subscription.findFirst({ where: { userId, status: { in: ["AUTHORIZED", "PAUSED"] } }, orderBy: { createdAt: "desc" } });
  return s ? { plan: s.plan as PlanCode, interval: s.interval as PlanInterval, amountCents: s.amountCents, status: s.status, since: s.updatedAt.toISOString() } : null;
}

/**
 * Confere a assinatura do webhook (header x-signature "ts=...,v1=...").
 * Manifesto: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" — partes ausentes ficam de fora.
 */
export function verifyWebhookSignature(signature: string | null, requestId: string | null, dataId: string | null, secret = process.env.MP_WEBHOOK_SECRET) {
  if (!secret || !signature) return false;
  const parts = Object.fromEntries(signature.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  if (!parts.ts || !parts.v1) return false;
  let manifest = "";
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${parts.ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
