// Metas e comissões: regras de comissão dos membros, a comissão de cada período (calculada das vendas), o extrato
// (bônus, ajustes e pagamentos) de membros e parceiros, o pagamento (que pode virar despesa no Financeiro) e a visão
// geral. A comissão de parceiro é a que já sai em cada venda (Sale.partnerCommissionCents).
import { Prisma } from "@prisma/client";
import { prisma, DomainError } from "../db";
import { listSales } from "./sales";
import {
  COMMISSION_KINDS, commissionFor, effectiveValue, measure, periodLabel, periodNext, periodStartOf, periodsUntil, statsFor,
  type CommissionBase, type CommissionKind, type CommissionPeriod, type SaleLite, type Tier,
} from "@/domain/commissions";
import { brDay } from "@/domain/brasilia";

const today = () => new Date(`${brDay()}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/* ---------------- Regras ---------------- */

export type RuleInput = { memberId: string; kind: CommissionKind; value: number; base: CommissionBase; tiers?: Tier[]; period: CommissionPeriod; startsAt: Date; active?: boolean };

function checkRule(input: RuleInput) {
  if (!(input.kind in COMMISSION_KINDS)) throw new DomainError(400, "Tipo de comissão inválido");
  const pct = input.kind === "SALE_PCT" || input.kind === "PROFIT_PCT";
  const okValue = (v: number) => Number.isInteger(v) && v >= 0 && (!pct || v <= 100_00);
  if (!okValue(input.value)) throw new DomainError(400, pct ? "A porcentagem vai de 0 a 100%" : "Valor inválido");
  const tiers = (input.tiers ?? []).map((t) => ({ min: Math.round(t.min), value: Math.round(t.value) }));
  if (tiers.some((t) => !(t.min >= 0) || !okValue(t.value))) throw new DomainError(400, "Faixa inválida");
  if (new Set(tiers.map((t) => t.min)).size !== tiers.length) throw new DomainError(400, "Duas faixas com o mesmo começo");
  return tiers.sort((a, b) => a.min - b.min).slice(0, 10);
}

export async function listRules(userId: string) {
  const rows = await prisma.commissionRule.findMany({ where: { userId }, include: { member: { select: { name: true, color: true } } }, orderBy: [{ active: "desc" }, { createdAt: "asc" }] });
  return rows.map((r) => ({
    id: r.id, memberId: r.memberId, member: r.member.name, memberColor: r.member.color, kind: r.kind as CommissionKind, value: r.value, base: r.base as CommissionBase,
    tiers: (r.tiers as Tier[]) ?? [], period: r.period as CommissionPeriod, startsAt: iso(r.startsAt), active: r.active,
  }));
}

export async function saveRule(userId: string, id: string | null, input: RuleInput) {
  const tiers = checkRule(input);
  if (!(await prisma.teamMember.count({ where: { id: input.memberId, userId } }))) throw new DomainError(404, "Membro não encontrado");
  const data = {
    memberId: input.memberId, kind: input.kind, value: input.value, base: input.base === "TEAM" ? "TEAM" : "INDIVIDUAL", tiers: tiers as unknown as Prisma.InputJsonValue,
    period: input.period === "QUARTER" ? "QUARTER" : "MONTH", startsAt: periodStartOf(input.period === "QUARTER" ? "QUARTER" : "MONTH", input.startsAt), ...(input.active !== undefined ? { active: input.active } : {}),
  };
  if (!id) return (await prisma.commissionRule.create({ data: { userId, ...data } })).id;
  const { count } = await prisma.commissionRule.updateMany({ where: { id, userId }, data });
  if (!count) throw new DomainError(404, "Regra não encontrada");
  return id;
}

export async function deleteRule(userId: string, id: string) {
  const { count } = await prisma.commissionRule.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Regra não encontrada");
}

/* ---------------- Cálculo ---------------- */

const toLite = (s: Awaited<ReturnType<typeof listSales>>[number]): SaleLite => ({ occurredAt: s.date, issuerIds: s.issuerIds, totalCents: s.totalCents, resultCents: s.resultCents, points: s.points, refunded: !!s.refund });

/** Comissão de cada membro em cada período das regras ativas, do início de cada regra até o período atual. */
async function computed(userId: string, now = today()) {
  const rules = await prisma.commissionRule.findMany({ where: { userId, active: true } });
  if (!rules.length) return [];
  const from = rules.reduce((m, r) => (r.startsAt < m ? r.startsAt : m), rules[0]!.startsAt);
  const sales = (await listSales(userId, { from })).map(toLite);
  const out: { memberId: string; ruleId: string; period: CommissionPeriod; start: Date; label: string; measure: number; value: number; cents: number }[] = [];
  for (const r of rules) {
    const period = r.period as CommissionPeriod;
    const rule = { kind: r.kind as CommissionKind, value: r.value, tiers: (r.tiers as Tier[]) ?? [] };
    for (const start of periodsUntil(period, r.startsAt, now)) {
      const end = periodNext(period, start);
      const inPeriod = sales.filter((s) => { const d = new Date(s.occurredAt); return d >= start && d < end; });
      const st = statsFor(inPeriod, r.memberId, r.base as CommissionBase);
      out.push({ memberId: r.memberId, ruleId: r.id, period, start, label: periodLabel(period, start), measure: Math.round(measure(rule.kind, st)), value: effectiveValue(rule, st), cents: commissionFor(rule, st) });
    }
  }
  return out;
}

type Owner = { memberId: string } | { partnerId: string };
const ownerWhere = (o: Owner) => ("memberId" in o ? { memberId: o.memberId } : { partnerId: o.partnerId });

async function checkOwner(userId: string, o: Owner) {
  const ok = "memberId" in o
    ? await prisma.teamMember.count({ where: { id: o.memberId, userId } })
    : await prisma.partner.count({ where: { id: o.partnerId, userId } });
  if (!ok) throw new DomainError(404, "memberId" in o ? "Membro não encontrado" : "Parceiro não encontrado");
}

/**
 * Extrato de um membro ou parceiro, do mais novo para o mais antigo: comissão de cada período (calculada), bônus,
 * ajustes e pagamentos; e o saldo a pagar (comissões + bônus + ajustes − pagamentos).
 */
export async function statement(userId: string, o: Owner, now = today()) {
  await checkOwner(userId, o);
  const entries = await prisma.commissionEntry.findMany({ where: { userId, ...ownerWhere(o) }, orderBy: { date: "desc" } });
  type Row = { id: string | null; kind: "COMMISSION" | "BONUS" | "ADJUST" | "PAYMENT"; date: string; label: string; amountCents: number; note: string | null; finTransactionId: string | null };
  const rows: Row[] = entries.map((e) => ({ id: e.id, kind: e.kind as Row["kind"], date: iso(e.date), label: e.kind === "PAYMENT" ? "Pagamento" : e.kind === "BONUS" ? "Bônus" : "Ajuste", amountCents: e.amountCents, note: e.note, finTransactionId: e.finTransactionId }));
  if ("memberId" in o) {
    for (const c of (await computed(userId, now)).filter((c) => c.memberId === o.memberId && c.cents > 0)) {
      rows.push({ id: null, kind: "COMMISSION", date: iso(c.start), label: `Comissão ${c.label}`, amountCents: c.cents, note: null, finTransactionId: null });
    }
  } else {
    // parceiro: a comissão de cada venda, agrupada por mês
    const p = await prisma.partner.findUniqueOrThrow({ where: { id: o.partnerId }, include: { sales: { where: { refundedAt: null }, select: { occurredAt: true, partnerCommissionCents: true } } } });
    const byMonth = new Map<string, number>();
    for (const s of p.sales) { const k = iso(periodStartOf("MONTH", s.occurredAt)); byMonth.set(k, (byMonth.get(k) ?? 0) + s.partnerCommissionCents); }
    for (const [k, cents] of byMonth) if (cents > 0) rows.push({ id: null, kind: "COMMISSION", date: k, label: `Comissão ${periodLabel("MONTH", new Date(`${k}T00:00:00Z`))}`, amountCents: cents, note: null, finTransactionId: null });
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || (a.kind === "PAYMENT" ? -1 : 1));
  const earned = rows.filter((r) => r.kind !== "PAYMENT").reduce((t, r) => t + r.amountCents, 0);
  const paid = rows.filter((r) => r.kind === "PAYMENT").reduce((t, r) => t + r.amountCents, 0);
  return { rows, earnedCents: earned, paidCents: paid, balanceCents: earned - paid };
}

/** Bônus ou ajuste lançado à mão no extrato. */
export async function addEntry(userId: string, input: Owner & { kind: "BONUS" | "ADJUST"; amountCents: number; date: Date; note?: string | null }, actorId: string) {
  await checkOwner(userId, input);
  if (!Number.isInteger(input.amountCents) || input.amountCents === 0 || (input.kind === "BONUS" && input.amountCents < 0)) throw new DomainError(400, "Valor inválido");
  return (await prisma.commissionEntry.create({ data: { userId, ...ownerWhere(input), kind: input.kind, amountCents: input.amountCents, date: input.date, note: input.note?.trim() || null, createdById: actorId } })).id;
}

/** Pagamento de comissão: entra no extrato e, com uma conta do Financeiro, vira uma despesa paga em Pessoal › Comissões. */
export async function payCommission(userId: string, input: Owner & { amountCents: number; date: Date; finAccountId?: string | null; note?: string | null }, actorId: string) {
  await checkOwner(userId, input);
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new DomainError(400, "Informe o valor pago");
  if (input.finAccountId && !(await prisma.finAccount.count({ where: { id: input.finAccountId, userId } }))) throw new DomainError(404, "Conta do Financeiro não encontrada");
  const name = "memberId" in input
    ? (await prisma.teamMember.findUniqueOrThrow({ where: { id: input.memberId }, select: { name: true } })).name
    : (await prisma.partner.findUniqueOrThrow({ where: { id: input.partnerId }, select: { name: true } })).name;
  return prisma.$transaction(async (tx) => {
    const fin = input.finAccountId
      ? await tx.finTransaction.create({
          data: {
            userId, type: "EXPENSE", accountId: input.finAccountId, category: "Pessoal › Comissões", amountCents: input.amountCents,
            description: `Comissão · ${name}${input.note?.trim() ? ` · ${input.note.trim()}` : ""}`, counterpart: name,
            competence: periodStartOf("MONTH", input.date), dueDate: input.date, paidAt: input.date,
          },
        })
      : null;
    const e = await tx.commissionEntry.create({ data: { userId, ...ownerWhere(input), kind: "PAYMENT", amountCents: input.amountCents, date: input.date, note: input.note?.trim() || null, finTransactionId: fin?.id ?? null, createdById: actorId } });
    return e.id;
  });
}

/** Apaga um lançamento do extrato (o pagamento leva junto a despesa que criou no Financeiro, se `finance`). */
export async function deleteEntry(userId: string, id: string, opts: { finance: boolean } = { finance: true }) {
  const e = await prisma.commissionEntry.findFirst({ where: { id, userId } });
  if (!e) throw new DomainError(404, "Lançamento não encontrado");
  if (e.finTransactionId && !opts.finance) throw new DomainError(403, "Este pagamento está no Financeiro: só quem edita o Financeiro pode apagar");
  await prisma.$transaction(async (tx) => {
    await tx.commissionEntry.delete({ where: { id: e.id } });
    if (e.finTransactionId) await tx.finTransaction.deleteMany({ where: { id: e.finTransactionId, userId } });
  });
}

/** Contas do Financeiro para lançar o pagamento. */
export const payAccounts = (userId: string) =>
  prisma.finAccount.findMany({ where: { userId, archived: false }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } });

/* ---------------- Visão geral ---------------- */

/**
 * Visão geral do mês: a meta da equipe (soma das metas de faturamento ativas no mês) e o realizado, as comissões a
 * pagar (saldo de todos) e as pagas no mês; por membro, a comissão do mês, o saldo a pagar e o pago no mês; e os
 * parceiros com o desempenho do mês.
 */
export async function commissionsOverview(userId: string, now = today()) {
  const month = periodStartOf("MONTH", now);
  const next = periodNext("MONTH", month);
  const [members, partners, comp, payments, goals, monthSales] = await Promise.all([
    prisma.teamMember.findMany({ where: { userId }, select: { id: true, name: true, color: true, active: true }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.partner.findMany({ where: { userId }, select: { id: true, name: true, active: true, sales: { where: { refundedAt: null }, select: { occurredAt: true, totalCents: true, partnerCommissionCents: true } } }, orderBy: { name: "asc" } }),
    computed(userId, now),
    prisma.commissionEntry.findMany({ where: { userId }, select: { memberId: true, partnerId: true, kind: true, amountCents: true, date: true } }),
    prisma.goal.findMany({ where: { userId, period: "MONTH", start: month }, include: { keyResults: { where: { metric: "REVENUE" }, select: { target: true } } } }),
    listSales(userId, { from: month, to: new Date(next.getTime() - 86_400_000) }),
  ]);
  const balance = (o: { memberId?: string; partnerId?: string }, earned: number) => {
    const mine = payments.filter((e) => (o.memberId ? e.memberId === o.memberId : e.partnerId === o.partnerId));
    const extra = mine.filter((e) => e.kind !== "PAYMENT").reduce((t, e) => t + e.amountCents, 0);
    const paid = mine.filter((e) => e.kind === "PAYMENT").reduce((t, e) => t + e.amountCents, 0);
    const paidMonth = mine.filter((e) => e.kind === "PAYMENT" && e.date >= month && e.date < next).reduce((t, e) => t + e.amountCents, 0);
    return { dueCents: earned + extra - paid, paidMonthCents: paidMonth };
  };
  const team = members.map((m) => {
    const mine = comp.filter((c) => c.memberId === m.id);
    const earned = mine.reduce((t, c) => t + c.cents, 0);
    const monthCents = mine.filter((c) => c.start <= month && periodNext(c.period, c.start) > month).reduce((t, c) => t + c.cents, 0);
    return { id: m.id, name: m.name, color: m.color, active: m.active, rules: new Set(mine.map((c) => c.ruleId)).size, monthCents, ...balance({ memberId: m.id }, earned) };
  });
  const partnerRows = partners.map((p) => {
    const inMonth = p.sales.filter((s) => s.occurredAt >= month && s.occurredAt < next);
    return {
      id: p.id, name: p.name, active: p.active, monthSales: inMonth.length, monthRevenueCents: inMonth.reduce((t, s) => t + s.totalCents, 0), monthCents: inMonth.reduce((t, s) => t + s.partnerCommissionCents, 0),
      ...balance({ partnerId: p.id }, p.sales.reduce((t, s) => t + s.partnerCommissionCents, 0)),
    };
  });
  const goalCents = goals.reduce((t, g) => t + g.keyResults.reduce((u, k) => u + k.target, 0), 0);
  const all = [...team, ...partnerRows];
  return {
    month: iso(month),
    totals: {
      goalCents: goalCents || null,
      achievedCents: monthSales.reduce((t, s) => t + s.totalCents, 0),
      dueCents: all.reduce((t, r) => t + Math.max(0, r.dueCents), 0),
      paidMonthCents: all.reduce((t, r) => t + r.paidMonthCents, 0),
    },
    team,
    partners: partnerRows,
  };
}
