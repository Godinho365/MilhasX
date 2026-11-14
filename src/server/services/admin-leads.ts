// Admin › Leads: quem chegou no período (contas criadas e cadastros não concluídos), de onde veio e em que pé está.
import { prisma } from "../db";
import { lastAdminEmails, leadRef } from "./admin-email";
import { paginate } from "@/lib/paging";
import { notifyPrefs, type PlanCode } from "@/domain/plans";
import {
  periodWindow, leadFunnel, leadOrigin, leadStatus, type AdminUser, type LeadStatus, type PeriodKey,
} from "@/domain/admin-metrics";

export const LEAD_FILTERS = ["unfinished", "trial", "trial_over", "asked", "paid", "free"] as const;

export const LEADS_PAGE_SIZE = 50;

/** `page` é a página da lista (de LEADS_PAGE_SIZE); "all" devolve a lista inteira (CSV). */
export async function leadsData(period: PeriodKey, filter: string | null, now = new Date(), page: number | "all" = 1, pageSize = LEADS_PAGE_SIZE) {
  const w = periodWindow(period, now);
  const inWin = { gte: w.from, lt: w.to };
  const [rawUsers, codes, requestLogs] = await Promise.all([
    prisma.user.findMany({
      where: { role: "USER", workspaceOwnerId: null, createdAt: inWin },
      select: {
        id: true, name: true, email: true, phone: true, plan: true, planInterval: true, trialEndsAt: true, createdAt: true, planRequest: true, planRequestedAt: true,
        deletionRequestedAt: true, status: true, googleId: true, referredById: true, signupUtm: true,
        preference: { select: { notifications: true } },
        subscriptions: { select: { status: true, amountCents: true, interval: true } },
        entries: { select: { createdAt: true }, orderBy: { createdAt: "asc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Pediram o código de cadastro no período (o e-mail é tudo o que se tem de quem não concluiu)
    prisma.emailCode.findMany({ where: { purpose: "signup", createdAt: inWin }, select: { id: true, email: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    prisma.auditLog.findMany({ where: { action: { in: ["billing.plan_request", "billing.checkout"] }, createdAt: { gte: w.from } }, select: { actorId: true } }),
  ]);
  const asked = new Set(requestLogs.map((l) => l.actorId).filter((x): x is string => !!x));
  for (const u of rawUsers) if (u.subscriptions.length || u.planRequestedAt) asked.add(u.id);
  const paidUsers = new Set(rawUsers.filter((u) => u.subscriptions.some((s) => s.status === "AUTHORIZED")).map((u) => u.id));

  // Quem pediu código e não tem conta com esse e-mail (nem antes do período)
  const codeEmails = [...new Set(codes.map((c) => c.email))];
  const existing = new Set((await prisma.user.findMany({ where: { email: { in: codeEmails } }, select: { email: true } })).map((u) => u.email));
  // O código mais recente de cada e-mail: o id dele identifica o lead no botão "Enviar e-mail de recuperação"
  const unfinishedMap = new Map<string, { at: Date; codeId: string }>();
  for (const c of codes) if (!existing.has(c.email) && !unfinishedMap.has(c.email)) unfinishedMap.set(c.email, { at: c.createdAt, codeId: c.id });

  const rows = rawUsers.map((u) => {
    const au: AdminUser = { ...u, plan: u.plan as PlanCode, planRequest: u.planRequest as PlanCode | null };
    const status = leadStatus(au, paidUsers, asked, now);
    const { origin, campaign } = leadOrigin(u);
    const sub = u.subscriptions.find((s) => s.status === "AUTHORIZED");
    return {
      key: u.id, userId: u.id as string | null, codeId: null as string | null, name: u.name, email: u.email, phone: u.phone, createdAt: u.createdAt, status, origin, campaign,
      method: u.googleId ? "Google" : "E-mail",
      marketing: notifyPrefs(u.preference?.notifications).marketing.email,
      used: !!u.entries[0],
      trialDaysLeft: u.trialEndsAt && u.trialEndsAt > now ? Math.ceil((u.trialEndsAt.getTime() - now.getTime()) / 86400_000) : 0,
      mrrCents: sub ? Math.round(sub.amountCents / (sub.interval === "ANUAL" ? 12 : 1)) : 0,
    };
  });
  const unfinished = [...unfinishedMap].map(([email, { at, codeId }]) => ({
    key: `code:${email}`, userId: null, codeId, name: "", email, phone: null as string | null, createdAt: at, status: "unfinished" as LeadStatus, origin: "—", campaign: null as string | null,
    method: "E-mail", marketing: false, used: false, trialDaysLeft: 0, mrrCents: 0,
  }));
  const all = [...rows, ...unfinished].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const byOrigin = new Map<string, { origin: string; leads: number; used: number; paid: number; mrrCents: number }>();
  for (const r of rows) {
    const o = byOrigin.get(r.origin) ?? { origin: r.origin, leads: 0, used: 0, paid: 0, mrrCents: 0 };
    o.leads++;
    if (r.used) o.used++;
    if (r.status === "paid") o.paid++;
    o.mrrCents += r.mrrCents;
    byOrigin.set(r.origin, o);
  }
  const counts = Object.fromEntries(LEAD_FILTERS.map((f) => [f, all.filter((r) => r.status === f).length])) as Record<LeadStatus, number>;
  const st = (LEAD_FILTERS as readonly string[]).includes(filter ?? "") ? (filter as LeadStatus) : null;
  return {
    window: w,
    filter: st,
    total: all.length,
    counts,
    marketing: rows.filter((r) => r.marketing).length,
    withPhone: rows.filter((r) => r.phone).length,
    mrrCents: rows.reduce((t, r) => t + r.mrrCents, 0),
    tracked: rows.filter((r) => r.origin !== "Direto / sem origem").length,
    funnel: leadFunnel({ started: rows.length + unfinished.length, accounts: rows.length, used: rows.filter((r) => r.used).length, asked: rows.filter((r) => r.status === "asked" || r.status === "paid").length, paid: counts.paid }),
    origins: [...byOrigin.values()].sort((a, b) => b.leads - a.leads),
    ...(await withEmailSent(list(st ? all.filter((r) => r.status === st) : all, page, pageSize), page === "all")),
  };
}

/** Na página da tela, quando o MilhasX mandou e-mail para cada lead (o CSV não precisa). */
async function withEmailSent<T extends { userId: string | null; email: string }, P>(l: { list: T[]; paging: P }, skip: boolean) {
  const ref = (r: T) => r.userId ?? leadRef(r.email);
  const sent = skip ? new Map<string, Date>() : await lastAdminEmails(l.list.map(ref));
  return { ...l, list: l.list.map((r) => ({ ...r, emailSentAt: sent.get(ref(r)) ?? null })) };
}

/** Lista da tela: `list` é a página pedida e `paging` diz onde ela está no total do filtro. */
function list<T>(rows: T[], page: number | "all", pageSize: number) {
  if (page === "all") return { list: rows, paging: { page: 1, pages: 1, total: rows.length, pageSize: Math.max(rows.length, 1) } };
  const { items, ...paging } = paginate(rows, page, pageSize);
  return { list: items, paging };
}
