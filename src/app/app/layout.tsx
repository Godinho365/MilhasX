import { requirePageUser, selectedHolderValue, appName, publicBrand } from "@/server/session";
import { listHolders, listAccounts } from "@/server/services/wallet";
import { unreadCount } from "@/server/services/market";
import { unreadNews } from "@/server/services/extras";
import { getSettings } from "@/server/services/admin";
import { processDueRecurrences } from "@/server/services/accounts";
import { prisma } from "@/server/db";
import { Shell } from "@/components/shell";
import type { DashboardView } from "@/lib/dashboard-views";
import { PLANS, VALUES_MODES, effectivePlan } from "@/domain/plans";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  // Gera os lançamentos recorrentes vencidos (idempotente)
  await processDueRecurrences(user.id);
  const [holders, accounts, unread, holderId, news, settings, pref, cards, stores, guides] = await Promise.all([
    listHolders(user.id),
    listAccounts(user.id),
    unreadCount(user.id),
    selectedHolderValue(user.id),
    unreadNews(user.id),
    getSettings(),
    prisma.userPreference.findUnique({ where: { userId: user.id }, select: { dashboardView: true, soundEffects: true, valuesMode: true, hideVideoTutorials: true } }),
    prisma.creditCard.findMany({ where: { userId: user.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.store.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.guide.findMany({ where: { published: true }, select: { slug: true, title: true, tags: true, kind: true }, orderBy: { order: "asc" } }),
  ]);
  const programs = new Map<string, { id: string; name: string; color: string }>();
  for (const a of accounts) programs.set(a.programId, { id: a.programId, name: a.program.name, color: a.program.color });
  const eff = effectivePlan(user);
  const view = (["visao-geral", "vendas", "gestao"] as const).find((v) => v === pref?.dashboardView) ?? "gestao";
  return (
    <Shell
      appName={appName()}
      user={{ name: user.name, email: user.email, role: user.role, avatarVersion: user.avatarUpdatedAt?.getTime().toString() ?? null }}
      holders={holders.filter((h) => h.active || h.id === holderId).map((h) => ({ id: h.id, name: h.name, isSelf: h.isSelf }))}
      programs={[...programs.values()]}
      accounts={accounts.filter((a) => !a.archived).map((a) => ({ pinned: a.pinned, id: a.id, holder: a.holder.name, program: a.program.name, color: a.program.color, balance: a.balance, costCents: a.costCents, programId: a.programId, holderId: a.holderId, logo: a.program.logoUpdatedAt?.getTime().toString() ?? null }))}
      cards={cards}
      stores={stores}
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
