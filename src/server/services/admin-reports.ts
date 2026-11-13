// Admin › Relatórios: planilhas CSV (separadas por ";", abrem direto no Excel) filtradas pelo período.
import { prisma, DomainError, audit } from "../db";
import { periodWindow, type PeriodKey } from "@/domain/admin-metrics";
import { csvCell, exportCsv } from "./admin";
import { conversionData, recoveryData } from "./admin-dashboard";
import { leadsData } from "./admin-leads";

export const REPORTS = [
  { kind: "users", label: "Usuários", detail: "Todos os cadastros com plano, teste e uso", period: false },
  { kind: "leads", label: "Leads", detail: "Contas e cadastros não concluídos do período, com origem, campanha e situação", period: true },
  { kind: "signups", label: "Cadastros do período", detail: "Quem se cadastrou no período, com origem e plano atual", period: true },
  { kind: "subscriptions", label: "Assinaturas", detail: "Assinaturas do Mercado Pago atualizadas no período", period: true },
  { kind: "cohorts", label: "Coortes de conversão", detail: "Cadastros, ativação, pedidos e pagantes por semana/mês", period: true },
  { kind: "recovery", label: "Recuperação", detail: "Lista de quem chamar, com motivo e último contato", period: false },
  { kind: "coupons", label: "Cupons", detail: "Cupons de desconto e quantas vezes foram usados", period: false },
  { kind: "invites", label: "Convites", detail: "Convites com plano ou teste e quem usou cada um", period: false },
  { kind: "audit", label: "Auditoria", detail: "Ações registradas no período", period: true },
  { kind: "programs", label: "Programas", detail: "Programas de fidelidade e valor do milheiro", period: false },
] as const;
export type ReportKind = (typeof REPORTS)[number]["kind"];
export const isReportKind = (k: string | null): k is ReportKind => REPORTS.some((r) => r.kind === k);

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : "");
const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(";")).join("\n");

export async function reportCsv(actorId: string, kind: ReportKind, period: PeriodKey, now = new Date()): Promise<string> {
  const w = periodWindow(period, now);
  const inPeriod = { gte: w.from, lt: w.to };
  let rows: unknown[][];
  switch (kind) {
    case "users": {
      const us = await prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, status: true, plan: true, planInterval: true, trialEndsAt: true, planRequest: true, createdAt: true, _count: { select: { accounts: true, entries: true, sales: true } } },
        orderBy: { createdAt: "desc" },
      });
      rows = [["id", "nome", "email", "papel", "status", "plano", "cobranca", "teste_ate", "pedido_plano", "criado_em", "contas", "lancamentos", "vendas"],
        ...us.map((u) => [u.id, u.name, u.email, u.role, u.status, u.plan, u.planInterval ?? "", iso(u.trialEndsAt), u.planRequest ?? "", iso(u.createdAt), u._count.accounts, u._count.entries, u._count.sales])];
      break;
    }
    case "signups": {
      const us = await prisma.user.findMany({ where: { createdAt: inPeriod, role: "USER" }, select: { id: true, name: true, email: true, plan: true, trialEndsAt: true, googleId: true, referredById: true, createdAt: true }, orderBy: { createdAt: "desc" } });
      rows = [["id", "nome", "email", "origem", "plano", "teste_ate", "criado_em"],
        ...us.map((u) => [u.id, u.name, u.email, u.referredById ? "indicacao" : u.googleId ? "google" : "email", u.plan, iso(u.trialEndsAt), iso(u.createdAt)])];
      break;
    }
    case "leads": {
      const d = await leadsData(period, null, now, Number.POSITIVE_INFINITY);
      rows = [["email", "nome", "telefone", "situacao", "origem", "campanha", "metodo", "aceita_marketing", "usou", "chegou_em"],
        ...d.list.map((l) => [l.email, l.name, l.phone ?? "", l.status, l.origin, l.campaign ?? "", l.userId ? l.method : "", l.marketing ? "sim" : "nao", l.used ? "sim" : "nao", iso(l.createdAt)])];
      break;
    }
    case "subscriptions": {
      const ss = await prisma.subscription.findMany({ where: { updatedAt: inPeriod }, include: { user: { select: { email: true } } }, orderBy: { updatedAt: "desc" } });
      rows = [["id", "usuario", "plano", "cobranca", "valor_centavos", "status", "criada_em", "atualizada_em"],
        ...ss.map((s) => [s.id, s.user.email, s.plan, s.interval, s.amountCents, s.status, iso(s.createdAt), iso(s.updatedAt)])];
      break;
    }
    case "cohorts": {
      const d = await conversionData(period, now);
      rows = [["coorte", "cadastros", "ativaram", "pediram_plano", "pagantes", "conversao_pct"], ...[...d.cohorts, ...d.sources].map((r) => [r.key, r.signups, r.activated, r.asked, r.paid, r.rate])];
      break;
    }
    case "recovery": {
      const items = await recoveryData(now);
      rows = [["usuario_id", "nome", "email", "telefone", "motivo", "detalhe", "ultimo_uso", "ultimo_contato"],
        ...items.map((i) => [i.userId, i.user.name, i.user.email, i.user.phone ?? "", i.kind, i.detail, iso(i.lastActivity), iso(i.contact?.at)])];
      break;
    }
    case "coupons": {
      const cs = await prisma.coupon.findMany({ include: { _count: { select: { subscriptions: { where: { status: "AUTHORIZED" } } } } }, orderBy: { createdAt: "desc" } });
      rows = [["codigo", "tipo", "valor", "planos", "limite", "validade", "ativo", "usos_pagos", "criado_em"],
        ...cs.map((c) => [c.code, c.kind, c.value, c.plans.join(","), c.maxUses ?? "", iso(c.expiresAt), c.active, c._count.subscriptions, iso(c.createdAt)])];
      break;
    }
    case "invites": {
      const is = await prisma.planInvite.findMany({ include: { redemptions: { include: { user: { select: { email: true } } } } }, orderBy: { createdAt: "desc" } });
      rows = [["codigo", "tipo", "plano", "dias", "limite", "validade", "ativo", "usos", "usado_por"],
        ...is.map((i) => [i.code, i.kind, i.plan ?? "", i.days ?? "", i.maxUses ?? "", iso(i.expiresAt), i.active, i.redemptions.length, i.redemptions.map((r) => r.user.email).join(" ")])];
      break;
    }
    case "audit": {
      const logs = await prisma.auditLog.findMany({ where: { createdAt: inPeriod }, include: { actor: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 20000 });
      rows = [["data", "ator", "acao", "alvo", "alvo_id"], ...logs.map((l) => [iso(l.createdAt), l.actor?.email ?? "", l.action, l.targetType, l.targetId ?? ""])];
      break;
    }
    case "programs":
      return exportCsv(actorId, "programs");
    default:
      throw new DomainError(400, "Relatório inválido");
  }
  await audit(prisma, actorId, "admin.export", "Export", kind, { period });
  return toCsv(rows);
}
