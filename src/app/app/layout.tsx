import { requirePageUser, selectedHolderValue, appName, publicBrand } from "@/server/session";
import { listHolders, listAccounts, clubActiveAccounts } from "@/server/services/wallet";
import { unreadCount } from "@/server/services/market";
import { unreadNews } from "@/server/services/extras";
import { getSettings } from "@/server/services/admin";
import { processDueRecurrences } from "@/server/services/accounts";
import { notifyMonthlyBonus, bonusUsage } from "@/server/services/transfer-bonus";
import { notifyTodayEvents } from "@/server/services/calendar";
import { accountsCapacity } from "@/server/services/capacity";
import { prisma } from "@/server/db";
import { Shell } from "@/components/shell";
import type { DashboardView } from "@/lib/dashboard-views";
import { PLANS, VALUES_MODES, effectivePlan } from "@/domain/plans";
import { can, ROLE_LABEL } from "@/domain/permissions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const me = user.actor; // quem entrou: o dono ou um membro da equipe
  // milhas (contas e saldos no menu, "Novo lançamento"): só para quem a função permite
  const miles = can(me.permissions, "milhas");
  // Gera os lançamentos recorrentes vencidos (idempotente)
  await processDueRecurrences(user.id);
  // No 1º acesso do mês: aviso de que o limite de bônus de transferência renovou
  if (me.isOwner) await notifyMonthlyBonus(user.id);
  // No 1º acesso do dia: aviso com a agenda de hoje (embarques, check-ins, aniversários, eventos com "avisar")
  if (me.isOwner) await notifyTodayEvents(user.id, new Date(), { memo: true }).catch(() => false);
  const none = <T,>(v: T) => Promise.resolve(v);
  const [holders, accounts, unread, holderId, news, settings, pref, cards, guides, clubs, cap, bonusCaps] = await Promise.all([
    miles ? listHolders(user.id) : none([] as Awaited<ReturnType<typeof listHolders>>),
    miles ? listAccounts(user.id) : none([] as Awaited<ReturnType<typeof listAccounts>>),
    unreadCount(user.id),
    selectedHolderValue(user.id),
    unreadNews(me.id),
    getSettings(),
    prisma.userPreference.findUnique({ where: { userId: me.id }, select: { dashboardView: true, soundEffects: true, valuesMode: true, hideVideoTutorials: true } }),
    miles || can(me.permissions, "financeiro") ? prisma.creditCard.findMany({ where: { userId: user.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : none([]),
    prisma.guide.findMany({ where: { published: true }, select: { slug: true, title: true, tags: true, kind: true }, orderBy: { order: "asc" } }),
    miles ? clubActiveAccounts(user.id) : none(new Set<string>() as Awaited<ReturnType<typeof clubActiveAccounts>>),
    miles ? accountsCapacity(user.id) : none({ avg: { ptsPerCpf: 0 }, rows: [] } as unknown as Awaited<ReturnType<typeof accountsCapacity>>),
    miles ? bonusUsage(user.id) : none([] as Awaited<ReturnType<typeof bonusUsage>>),
  ]);
  const capBy = new Map(cap.rows.map((r) => [r.id, r]));
  const bonusLeft = new Map(bonusCaps.map((b) => [b.accountId, b.left]));
  const programs = new Map<string, { id: string; name: string; color: string }>();
  for (const a of accounts) programs.set(a.programId, { id: a.programId, name: a.program.name, color: a.program.color });
  const eff = effectivePlan(user);
  const view = (["visao-geral", "vendas", "gestao"] as const).find((v) => v === pref?.dashboardView) ?? "gestao";
  return (
    <Shell
      appName={appName()}
      user={{ name: me.name, email: me.email, role: user.role, avatarVersion: me.avatarUpdatedAt?.getTime().toString() ?? null }}
      access={{ isOwner: me.isOwner, permissions: me.permissions, roleLabel: me.role ? ROLE_LABEL[me.role] : null, workspaceName: me.isOwner ? null : user.name }}
      holders={holders.filter((h) => h.active || h.id === holderId).map((h) => ({ id: h.id, name: h.name, isSelf: h.isSelf }))}
      programs={[...programs.values()]}
      accounts={accounts.filter((a) => !a.archived).map((a) => ({ pinned: a.pinned, id: a.id, holder: a.holder.name, program: a.program.name, color: a.program.color, balance: a.balance, costCents: a.costCents, programId: a.programId, holderId: a.holderId, logo: a.program.logoUpdatedAt?.getTime().toString() ?? null, bonusPct: a.transferBonusPct, bonusLeft: bonusLeft.get(a.id) ?? null, clubActive: clubs.has(a.id), space: capBy.get(a.id)?.space ?? null, cpfFree: capBy.get(a.id)?.load.cpfFree ?? null, ptsPerCpf: cap.avg.ptsPerCpf }))}
      cards={cards}
      holderId={holderId}
      unread={unread}
      unreadNews={news}
      supportEmail={String(settings.supportEmail || process.env.SUPPORT_EMAIL || "")}
      dashboardView={view as DashboardView}
      prefs={{ sound: pref?.soundEffects !== false, valuesMode: VALUES_MODES.find((m) => m === pref?.valuesMode) ?? "VISIBLE", hideTutorials: !!pref?.hideVideoTutorials }}
      plan={{ name: PLANS[eff.plan].name, trialDaysLeft: eff.trialDaysLeft }}
      brand={publicBrand()}
      guides={guides.map((g) => ({ slug: g.slug, title: g.title, tags: g.tags, video: g.kind === "VIDEO" }))}
    >
      {children}
    </Shell>
  );
}
