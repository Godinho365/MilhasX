// Cupons de desconto e convites com plano: regras puras (validação, desconto e situação).
import { PLANS, type PlanCode, type PlanInterval } from "./plans";

export const MIN_CHARGE_CENTS = 100; // o Mercado Pago não aceita assinatura abaixo de R$ 1,00

/** Código em maiúsculas, só letras, números, hífen e sublinhado. */
export const normalizeCode = (c: string) => c.trim().toUpperCase().replace(/\s+/g, "");
export const CODE_RE = /^[A-Z0-9_-]{3,30}$/;

export type CouponRule = {
  code: string;
  kind: string; // PERCENT | FIXED
  value: number;
  plans: string[];
  intervals: string[];
  maxUses: number | null;
  expiresAt: Date | null;
  active: boolean;
};

export type CouponCheck =
  | { ok: true; discountCents: number; finalCents: number; label: string }
  | { ok: false; error: string };

export function couponLabel(c: Pick<CouponRule, "kind" | "value">) {
  return c.kind === "PERCENT" ? `${c.value}% de desconto` : `${(c.value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de desconto`;
}

/**
 * Confere o cupom para o plano/cobrança escolhidos. `baseCents` é o valor de cada cobrança (o anual já somado);
 * `uses` são as assinaturas pagas que já usaram o cupom.
 */
export function checkCoupon(c: CouponRule | null, plan: PlanCode, interval: PlanInterval, baseCents: number, uses: number, now = new Date()): CouponCheck {
  if (!c || !c.active) return { ok: false, error: "Cupom inválido" };
  if (c.expiresAt && c.expiresAt <= now) return { ok: false, error: "Este cupom expirou" };
  if (c.maxUses !== null && uses >= c.maxUses) return { ok: false, error: "Este cupom já atingiu o limite de usos" };
  if (c.plans.length && !c.plans.includes(plan)) return { ok: false, error: `Este cupom não vale para o plano ${PLANS[plan].name}` };
  if (c.intervals.length && !c.intervals.includes(interval)) return { ok: false, error: `Este cupom vale só para a cobrança ${c.intervals[0] === "ANUAL" ? "anual" : "mensal"}` };
  const raw = c.kind === "PERCENT" ? Math.round((baseCents * c.value) / 100) : c.value;
  const discountCents = Math.max(0, Math.min(raw, baseCents - MIN_CHARGE_CENTS));
  return { ok: true, discountCents, finalCents: baseCents - discountCents, label: couponLabel(c) };
}

export type CouponInput = { code: string; kind: "PERCENT" | "FIXED"; value: number; plans: string[]; intervals: string[]; maxUses: number | null; expiresAt: Date | null; note: string | null };

export function validateCouponInput(i: CouponInput): string | null {
  if (!CODE_RE.test(normalizeCode(i.code))) return "Código com 3 a 30 letras, números, hífen ou sublinhado";
  if (i.kind === "PERCENT" && (!Number.isInteger(i.value) || i.value < 1 || i.value > 100)) return "Percentual de 1 a 100";
  if (i.kind === "FIXED" && (!Number.isInteger(i.value) || i.value < 1)) return "Informe o valor do desconto";
  if (i.maxUses !== null && (!Number.isInteger(i.maxUses) || i.maxUses < 1)) return "Limite de usos inválido";
  if (i.plans.some((p) => p !== "PRO" && p !== "GESTOR")) return "Plano inválido";
  if (i.intervals.some((p) => p !== "MENSAL" && p !== "ANUAL")) return "Cobrança inválida";
  return null;
}

// ---------- Convites ----------

export type InviteRule = { kind: string; plan: PlanCode | null; interval: string | null; days: number | null; maxUses: number | null; expiresAt: Date | null; active: boolean };

export type InviteState = "active" | "paused" | "expired" | "full";

export function inviteState(i: InviteRule, uses: number, now = new Date()): InviteState {
  if (!i.active) return "paused";
  if (i.expiresAt && i.expiresAt <= now) return "expired";
  if (i.maxUses !== null && uses >= i.maxUses) return "full";
  return "active";
}

export const INVITE_STATE_LABEL: Record<InviteState, string> = { active: "Ativo", paused: "Pausado", expired: "Expirado", full: "Esgotado" };

export function inviteLabel(i: Pick<InviteRule, "kind" | "plan" | "interval" | "days">) {
  if (i.kind === "PLAN" && i.plan) return `Plano ${PLANS[i.plan].name}${i.interval === "ANUAL" ? " anual" : ""} de cortesia`;
  return `${i.days ?? 0} dias de teste do Gestor`;
}

/**
 * O que o convite muda na conta. Teste: soma os dias ao teste em curso (ou começa agora). Plano: só se a pessoa
 * ainda não paga um plano igual ou maior.
 */
export function inviteEffect(i: InviteRule, u: { plan: PlanCode; trialEndsAt: Date | null }, now = new Date()):
  | { ok: true; data: { trialEndsAt: Date } | { plan: PlanCode; planInterval: string } }
  | { ok: false; error: string } {
  if (i.kind === "TRIAL") {
    if (!i.days || i.days < 1) return { ok: false, error: "Convite inválido" };
    if (u.plan !== "PESSOAL") return { ok: false, error: "Você já tem um plano pago; o teste não se aplica" };
    const base = u.trialEndsAt && u.trialEndsAt > now ? u.trialEndsAt.getTime() : now.getTime();
    return { ok: true, data: { trialEndsAt: new Date(base + i.days * 86400_000) } };
  }
  if (!i.plan || i.plan === "PESSOAL") return { ok: false, error: "Convite inválido" };
  const rank: Record<PlanCode, number> = { PESSOAL: 0, PRO: 1, GESTOR: 2 };
  if (rank[u.plan] >= rank[i.plan]) return { ok: false, error: `Você já tem o plano ${PLANS[u.plan].name}` };
  return { ok: true, data: { plan: i.plan, planInterval: i.interval === "ANUAL" ? "ANUAL" : "MENSAL" } };
}

export type InviteInput = { code: string; kind: "PLAN" | "TRIAL"; plan: PlanCode | null; interval: PlanInterval | null; days: number | null; maxUses: number | null; expiresAt: Date | null; note: string | null };

export function validateInviteInput(i: InviteInput): string | null {
  if (!CODE_RE.test(normalizeCode(i.code))) return "Código com 3 a 30 letras, números, hífen ou sublinhado";
  if (i.kind === "TRIAL" && (!i.days || !Number.isInteger(i.days) || i.days < 1 || i.days > 365)) return "Dias de teste: de 1 a 365";
  if (i.kind === "PLAN" && (i.plan !== "PRO" && i.plan !== "GESTOR")) return "Escolha o plano PRO ou Gestor";
  if (i.maxUses !== null && (!Number.isInteger(i.maxUses) || i.maxUses < 1)) return "Limite de usos inválido";
  return null;
}
