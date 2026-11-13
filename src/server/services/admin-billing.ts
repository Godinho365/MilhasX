// Admin › Assinaturas: assinaturas do Mercado Pago, planos ativados à mão e a fila de pedidos de plano.
import { prisma, DomainError, audit } from "../db";
import { periodWindow, inRange, type PeriodKey } from "@/domain/admin-metrics";

export const SUB_STATUSES = ["AUTHORIZED", "PENDING", "PAUSED", "CANCELLED"] as const;

export async function subscriptionsOverview(period: PeriodKey, status: string | null, now = new Date()) {
  const w = periodWindow(period, now);
  const st = (SUB_STATUSES as readonly string[]).includes(status ?? "") ? status! : null;
  const userSel = { select: { id: true, name: true, email: true } } as const;
  const [all, list, requests, manual] = await Promise.all([
    prisma.subscription.findMany({ select: { userId: true, status: true, amountCents: true, interval: true, createdAt: true, updatedAt: true } }),
    prisma.subscription.findMany({ where: st ? { status: st } : undefined, include: { user: userSel, coupon: { select: { code: true } } }, orderBy: { updatedAt: "desc" }, take: 200 }),
    prisma.user.findMany({
      where: { planRequest: { not: null } },
      select: { id: true, name: true, email: true, plan: true, planRequest: true, planRequestInterval: true, planRequestedAt: true, trialEndsAt: true },
      orderBy: { planRequestedAt: "asc" },
    }),
    prisma.user.findMany({
      where: { plan: { not: "PESSOAL" }, status: "ACTIVE", subscriptions: { none: { status: "AUTHORIZED" } } },
      select: { id: true, name: true, email: true, plan: true, planInterval: true, planInviteRedemptions: { where: { invite: { kind: "PLAN" } }, select: { invite: { select: { code: true } } }, take: 1 } },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);
  const counts = Object.fromEntries(SUB_STATUSES.map((s) => [s, all.filter((x) => x.status === s).length])) as Record<(typeof SUB_STATUSES)[number], number>;
  const mrrCents = all.filter((s) => s.status === "AUTHORIZED").reduce((t, s) => t + Math.round(s.amountCents / (s.interval === "ANUAL" ? 12 : 1)), 0);
  const inWin = (d: Date, from: Date, to: Date) => inRange(d, from, to);
  return {
    window: w,
    status: st,
    counts,
    mrrCents,
    started: all.filter((s) => inWin(s.createdAt, w.from, w.to)).length,
    activated: all.filter((s) => s.status === "AUTHORIZED" && inWin(s.updatedAt, w.from, w.to)).length,
    ended: all.filter((s) => (s.status === "CANCELLED" || s.status === "PAUSED") && inWin(s.updatedAt, w.from, w.to)).length,
    abandoned: all.filter((s) => s.status === "PENDING" && now.getTime() - s.createdAt.getTime() > 86400_000).length,
    list,
    requests,
    manual,
  };
}

/** Recusa o pedido de plano (o usuário continua no plano atual). */
export async function rejectPlanRequest(actorId: string, userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { planRequest: true } });
  if (!u) throw new DomainError(404, "Usuário não encontrado");
  if (!u.planRequest) throw new DomainError(409, "Este usuário não tem pedido de plano");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { planRequest: null, planRequestInterval: null, planRequestedAt: null } });
    await audit(tx, actorId, "admin.plan_request_reject", "User", userId, { plan: u.planRequest });
  });
}
