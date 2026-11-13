// Pendências da administração: alimentam o sino do topo, os números do menu e a Central de pendências.
import { prisma } from "../db";

const DAY = 86400_000;

export type PendingKey = "planRequests" | "deletions" | "trialsEnding" | "subsProblem" | "recovery" | "privacy";
export type PendingItem = { key: PendingKey; label: string; href: string; icon: string; n: number };

/** Checkout abandonado: começou a assinatura há 1 a 30 dias, não pagou e continua no Pessoal. */
export function recoveryWhere(now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY);
  const dayAgo = new Date(now.getTime() - DAY);
  return {
    role: "USER" as const,
    status: "ACTIVE" as const,
    plan: "PESSOAL" as const,
    subscriptions: { some: { status: "PENDING", createdAt: { gte: since, lte: dayAgo } }, none: { status: "AUTHORIZED" } },
  };
}

export async function adminPending(now = new Date()): Promise<{ items: PendingItem[]; total: number; nav: Record<string, number> }> {
  const week = new Date(now.getTime() + 7 * DAY);
  const [planRequests, deletions, trialsEnding, subsProblem, recovery, privacy] = await Promise.all([
    prisma.user.count({ where: { planRequest: { not: null } } }),
    prisma.user.count({ where: { deletionRequestedAt: { not: null } } }),
    prisma.user.count({ where: { role: "USER", plan: "PESSOAL", trialEndsAt: { gt: now, lte: week } } }),
    prisma.subscription.count({ where: { status: "PAUSED" } }),
    prisma.user.count({ where: recoveryWhere(now) }),
    prisma.privacyRequest.count({ where: { status: { not: "DONE" } } }),
  ]);
  const items: PendingItem[] = [
    { key: "planRequests", label: "Pedidos de plano", href: "/admin/subscriptions#pedidos", icon: "badge-check", n: planRequests },
    { key: "subsProblem", label: "Assinaturas pausadas", href: "/admin/subscriptions?s=PAUSED", icon: "alert-triangle", n: subsProblem },
    { key: "deletions", label: "Pedidos de exclusão", href: "/admin/users?f=deletion", icon: "user-x", n: deletions },
    { key: "trialsEnding", label: "Testes acabando (7 dias)", href: "/admin/recovery?t=trial", icon: "hourglass", n: trialsEnding },
    { key: "privacy", label: "Solicitações LGPD abertas", href: "/admin/privacy", icon: "shield", n: privacy },
    { key: "recovery", label: "Checkouts abandonados", href: "/admin/recovery?t=checkout", icon: "rotate-ccw", n: recovery },
  ];
  return {
    items,
    // Total do sino: só o que pede ação (testes acabando é informativo)
    total: planRequests + subsProblem + deletions + recovery + privacy,
    nav: { "/admin/users": deletions, "/admin/subscriptions": planRequests + subsProblem, "/admin/recovery": recovery, "/admin/privacy": privacy },
  };
}

/** Primeiras linhas de cada cartão da Central de pendências. */
export async function pendingLists(take = 5) {
  const [requests, deletions] = await Promise.all([
    prisma.user.findMany({ where: { planRequest: { not: null } }, select: { id: true, name: true, planRequest: true, planRequestInterval: true, planRequestedAt: true }, orderBy: { planRequestedAt: "asc" }, take }),
    prisma.user.findMany({ where: { deletionRequestedAt: { not: null } }, select: { id: true, name: true, deletionRequestedAt: true }, orderBy: { deletionRequestedAt: "asc" }, take }),
  ]);
  return { requests, deletions };
}
