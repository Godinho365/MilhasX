// Admin › Indicadores: busca no banco o que o painel precisa e entrega os números prontos.
// As contas ficam em domain/admin-metrics.ts (puras e testadas).
import { prisma } from "../db";
import type { PlanCode } from "@/domain/plans";
import {
  periodWindow, delta, revenue, churn, trialFunnel, trialConversion, activation, activeUsers, expiring, atRisk, seriesByBucket, inRange,
  type PeriodKey, type AdminUser, type AdminSub,
} from "@/domain/admin-metrics";

const DAY = 86_400_000;

type Row = { userId: string; at: Date };

/** Atividade de cada usuário por dia (primeiro registro do dia): logins, lançamentos e vendas. */
async function activitySince(since: Date): Promise<Row[]> {
  return prisma.$queryRaw<Row[]>`
    SELECT "userId", min("createdAt") AS at FROM (
      SELECT "userId", "createdAt" FROM "Session" WHERE "createdAt" >= ${since}
      UNION ALL SELECT "userId", "createdAt" FROM "Entry" WHERE "createdAt" >= ${since}
      UNION ALL SELECT "userId", "createdAt" FROM "Sale" WHERE "createdAt" >= ${since}
    ) t
    GROUP BY "userId", (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date`;
}

async function lastActivity(): Promise<Map<string, Date>> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT "userId", max("createdAt") AS at FROM (
      SELECT "userId", "createdAt" FROM "Session"
      UNION ALL SELECT "userId", "createdAt" FROM "Entry"
      UNION ALL SELECT "userId", "createdAt" FROM "Sale"
    ) t GROUP BY "userId"`;
  return new Map(rows.map((r) => [r.userId, r.at]));
}

/** Conta registros criados no período atual e no anterior. */
async function twoWindows(count: (from: Date, to: Date) => Promise<number>, w: { from: Date; to: Date; prevFrom: Date; prevTo: Date }) {
  const [cur, prev] = await Promise.all([count(w.from, w.to), count(w.prevFrom, w.prevTo)]);
  return { cur, prev, delta: delta(cur, prev) };
}

export async function adminDashboard(period: PeriodKey, now = new Date()) {
  const w = periodWindow(period, now);
  const r = (from: Date, to: Date) => ({ createdAt: { gte: from, lt: to } });

  const [rawUsers, rawSubs, requestLogs, planLogs, firstEntries, activity, last] = await Promise.all([
    prisma.user.findMany({
      // Clientes: sem administradores e sem os logins de equipe (que pertencem à conta do dono)
      where: { role: "USER", workspaceOwnerId: null },
      select: { id: true, name: true, email: true, plan: true, planInterval: true, trialEndsAt: true, createdAt: true, planRequest: true, planRequestedAt: true, deletionRequestedAt: true, status: true },
    }),
    prisma.subscription.findMany({ select: { id: true, userId: true, plan: true, interval: true, amountCents: true, status: true, createdAt: true, updatedAt: true } }),
    prisma.auditLog.findMany({ where: { action: { in: ["billing.plan_request", "billing.checkout"] } }, select: { actorId: true } }),
    prisma.auditLog.findMany({ where: { action: "admin.user_plan", createdAt: { gte: w.prevFrom } }, select: { targetId: true, meta: true, createdAt: true } }),
    prisma.entry.groupBy({ by: ["userId"], _min: { createdAt: true } }),
    activitySince(new Date(Math.min(w.prevFrom.getTime(), now.getTime() - 30 * DAY))),
    lastActivity(),
  ]);

  const ids = new Set(rawUsers.map((u) => u.id));
  const users: AdminUser[] = rawUsers.map((u) => ({ ...u, plan: u.plan as PlanCode, planRequest: u.planRequest as PlanCode | null }));
  const subs: AdminSub[] = rawSubs.filter((s) => ids.has(s.userId)).map((s) => ({ ...s, plan: s.plan as PlanCode }));
  const acts = activity.filter((a) => ids.has(a.userId));
  const requesters = new Set(requestLogs.map((l) => l.actorId).filter((x): x is string => !!x));
  const downgrades = planLogs
    .filter((l) => l.targetId && ids.has(l.targetId) && (l.meta as { plan?: string } | null)?.plan === "PESSOAL")
    .map((l) => ({ userId: l.targetId!, at: l.createdAt }));
  const firstEntry = new Map(firstEntries.filter((e) => e._min.createdAt).map((e) => [e.userId, e._min.createdAt!]));

  // ---- Receita
  const rev = revenue(users, subs);
  const ch = churn(subs, downgrades, w.from, w.to, rev.payers);
  const chPrev = churn(subs, downgrades, w.prevFrom, w.prevTo, rev.payers);
  const newPayers = (from: Date, to: Date) =>
    new Set([
      ...subs.filter((s) => s.status === "AUTHORIZED" && inRange(s.updatedAt, from, to)).map((s) => s.userId),
      ...planLogs.filter((l) => l.targetId && ids.has(l.targetId) && (l.meta as { plan?: string } | null)?.plan !== "PESSOAL" && inRange(l.createdAt, from, to)).map((l) => l.targetId!),
    ]).size;
  const trialsActive = users.filter((u) => u.status === "ACTIVE" && u.plan === "PESSOAL" && u.trialEndsAt && u.trialEndsAt > now).length;

  // ---- Crescimento
  const signups = { cur: users.filter((u) => inRange(u.createdAt, w.from, w.to)).length, prev: users.filter((u) => inRange(u.createdAt, w.prevFrom, w.prevTo)).length };
  const actCur = activeUsers(acts, w.from, w.to);
  const actPrev = activeUsers(acts, w.prevFrom, w.prevTo);
  const dau = activeUsers(acts, new Date(now.getTime() - DAY), now);
  const wau = activeUsers(acts, new Date(now.getTime() - 7 * DAY), now);
  const mau = activeUsers(acts, new Date(now.getTime() - 30 * DAY), now);
  const act = activation(users, firstEntry, w.from, w.to, now);
  const actPrevRate = activation(users, firstEntry, w.prevFrom, w.prevTo, now);
  const growthSeries = seriesByBucket(w, {
    signups: users.map((u) => ({ at: u.createdAt })),
    active: acts.map((a) => ({ at: a.at, id: a.userId })),
  });

  // ---- Uso por recurso
  const [entries, sales, salesCur, salesPrev, orders, holders, customers, quotes] = await Promise.all([
    twoWindows((f, t) => prisma.entry.count({ where: r(f, t) }), w),
    twoWindows((f, t) => prisma.sale.count({ where: r(f, t) }), w),
    prisma.sale.aggregate({ where: r(w.from, w.to), _sum: { totalCents: true } }),
    prisma.sale.aggregate({ where: r(w.prevFrom, w.prevTo), _sum: { totalCents: true } }),
    twoWindows((f, t) => prisma.travelOrder.count({ where: r(f, t) }), w),
    twoWindows((f, t) => prisma.holder.count({ where: r(f, t) }), w),
    twoWindows((f, t) => prisma.customer.count({ where: r(f, t) }), w),
    twoWindows((f, t) => prisma.flightQuote.count({ where: r(f, t) }), w),
  ]);
  const volCur = salesCur._sum.totalCents ?? 0, volPrev = salesPrev._sum.totalCents ?? 0;
  const [totEntries, totSales, totOrders, totHolders, totCustomers, totQuotes, programs] = await Promise.all([
    prisma.entry.count(), prisma.sale.count(), prisma.travelOrder.count(), prisma.holder.count(), prisma.customer.count(), prisma.flightQuote.count(), prisma.program.count({ where: { active: true } }),
  ]);

  // ---- Saúde e suporte
  const [emails, emailsPrev, emailKinds, pushTotal, pushNew, loginFail, loginFailPrev, recentAudit] = await Promise.all([
    prisma.emailDispatch.count({ where: r(w.from, w.to) }),
    prisma.emailDispatch.count({ where: r(w.prevFrom, w.prevTo) }),
    prisma.emailDispatch.groupBy({ by: ["kind"], where: r(w.from, w.to), _count: true }),
    prisma.pushSubscription.count(),
    prisma.pushSubscription.count({ where: r(w.from, w.to) }),
    prisma.loginAttempt.count({ where: { success: false, ...r(w.from, w.to) } }),
    prisma.loginAttempt.count({ where: { success: false, ...r(w.prevFrom, w.prevTo) } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, action: true, createdAt: true, actor: { select: { email: true } } } }),
  ]);

  const who = new Map(rawUsers.map((u) => [u.id, { name: u.name, email: u.email }]));
  const person = (id: string) => ({ id, ...(who.get(id) ?? { name: "—", email: "" }) });

  return {
    window: w,
    revenue: {
      ...rev,
      byPlan: Object.entries(rev.byPlan).map(([k, v]) => ({ plan: k.split("|")[0] as PlanCode, interval: k.split("|")[1]!, ...v })),
      trialsActive,
      churn: { ...ch, prevRate: chPrev.rate, delta: delta(ch.lost, chPrev.lost) },
      newPayers: { cur: newPayers(w.from, w.to), prev: newPayers(w.prevFrom, w.prevTo) },
      trialConversion: trialConversion(users, w.from, w.to, now),
    },
    growth: {
      totalUsers: users.length,
      activeAccounts: users.filter((u) => u.status === "ACTIVE").length,
      signups: { ...signups, delta: delta(signups.cur, signups.prev) },
      active: { cur: actCur, prev: actPrev, delta: delta(actCur, actPrev) },
      dau, wau, mau, stickiness: mau ? Math.round((dau / mau) * 1000) / 10 : 0,
      activation: { ...act, prevRate: actPrevRate.rate },
      series: growthSeries as { day: string; signups: number; active: number }[],
    },
    funnel: trialFunnel(users, subs, requesters, w.from, w.to),
    usage: [
      { key: "entries", label: "Lançamentos", ...entries, total: totEntries },
      { key: "sales", label: "Vendas", ...sales, total: totSales },
      { key: "orders", label: "Pedidos de viagem", ...orders, total: totOrders },
      { key: "quotes", label: "Cotações de voo", ...quotes, total: totQuotes },
      { key: "customers", label: "Clientes cadastrados", ...customers, total: totCustomers },
      { key: "holders", label: "Titulares", ...holders, total: totHolders },
    ],
    salesVolume: { cur: volCur, prev: volPrev, delta: delta(volCur, volPrev) },
    programs,
    expiring: expiring(users, subs, now).map((e) => ({ ...e, user: person(e.userId) })),
    risk: atRisk(users, last, now).slice(0, 15).map((x) => ({ ...x, user: person(x.userId) })),
    health: {
      emails: { cur: emails, prev: emailsPrev, delta: delta(emails, emailsPrev), byKind: emailKinds.map((k) => ({ kind: k.kind, count: k._count })) },
      push: { total: pushTotal, new: pushNew },
      loginFailures: { cur: loginFail, prev: loginFailPrev, delta: delta(loginFail, loginFailPrev) },
      pendingRequests: users.filter((u) => u.planRequest).length,
      deletionRequests: users.filter((u) => u.deletionRequestedAt).length,
      disabled: users.filter((u) => u.status !== "ACTIVE").length,
      recentAudit: recentAudit.map((a) => ({ id: a.id, action: a.action, at: a.createdAt, actor: a.actor?.email ?? "sistema" })),
    },
  };
}

export type AdminDashboard = Awaited<ReturnType<typeof adminDashboard>>;
